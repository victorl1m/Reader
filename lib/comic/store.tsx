"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ArchiveFormat,
  ComicErrorCode,
  ComicStatus,
  Page,
  RemoteComic,
  RemoteSource,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import {
  getPrefs,
  getServerPrefs,
  nextStripWidth,
  setPrefs,
  subscribePrefs,
  type ReadingMode,
} from "./prefs";
import { recallSpot, rememberSpot } from "./library";

export type { ReadingMode };

/**
 * How many full-size pages stay decoded at once.
 *
 * Comic pages are 1–3 MB each once decoded, so retaining a whole book is how a
 * reader like this ends up killing a tab. `deviceMemory` is coarse and often
 * absent, but it's enough to tell a 2 GB phone apart from a workstation.
 */
function retentionWindow(): number {
  const gb =
    typeof navigator !== "undefined" &&
    "deviceMemory" in navigator &&
    typeof navigator.deviceMemory === "number"
      ? navigator.deviceMemory
      : 4;
  return Math.max(8, Math.min(40, Math.round(gb * 6)));
}

type State = {
  status: ComicStatus;
  /** Also the key the reading position is remembered under. */
  fileName: string | null;
  format: ArchiveFormat | null;
  /** Set when the comic came from an integration rather than from disk. */
  source: RemoteSource | null;
  pages: Page[];
  thumbsReady: number;
  error: { message: string; code: ComicErrorCode } | null;
};

const initialState: State = {
  status: "idle",
  fileName: null,
  format: null,
  source: null,
  pages: [],
  thumbsReady: 0,
  error: null,
};

type Action =
  | { type: "open"; fileName: string; source: RemoteSource | null }
  | { type: "meta"; format: ArchiveFormat; pages: string[] }
  | { type: "remote"; pages: string[] }
  | { type: "page"; index: number; url: string }
  | { type: "thumb"; index: number; url: string; ratio: number | null }
  | { type: "evict"; indices: number[] }
  | { type: "thumbs-progress"; ready: number }
  | { type: "error"; message: string; code: ComicErrorCode }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "open":
      return {
        ...initialState,
        status: "opening",
        fileName: action.fileName,
        source: action.source,
      };
    case "meta":
      return {
        ...state,
        status: "ready",
        format: action.format,
        pages: action.pages.map((name, index) => ({
          index,
          name,
          url: null,
          thumb: null,
          ratio: null,
        })),
      };
    /**
     * A remote comic is ready the moment its page list arrives: there is
     * nothing to decode, so there is no container format and no thumbnail pass
     * to wait for. Thumbnails are a downscaled copy of each page served by the
     * image optimiser, so the rail is filled in immediately while the full-size
     * pages are still governed by the retention window below.
     */
    case "remote":
      return {
        ...state,
        status: "ready",
        format: null,
        thumbsReady: action.pages.length,
        pages: action.pages.map((url, index) => ({
          index,
          name: pageName(url),
          url: null,
          thumb: thumbUrl(url),
          ratio: null,
        })),
      };
    case "page": {
      const page = state.pages[action.index];
      if (!page || page.url === action.url) return state;
      const pages = state.pages.slice();
      pages[action.index] = { ...page, url: action.url };
      return { ...state, pages };
    }
    case "thumb": {
      const page = state.pages[action.index];
      if (!page) return state;
      const pages = state.pages.slice();
      pages[action.index] = {
        ...page,
        thumb: action.url,
        ratio: action.ratio ?? page.ratio,
      };
      return { ...state, pages };
    }
    case "evict": {
      const pages = state.pages.slice();
      let changed = false;
      for (const index of action.indices) {
        if (pages[index]?.url) {
          pages[index] = { ...pages[index], url: null };
          changed = true;
        }
      }
      return changed ? { ...state, pages } : state;
    }
    case "thumbs-progress":
      return { ...state, thumbsReady: action.ready };
    case "error":
      return {
        ...state,
        status: "error",
        error: { message: action.message, code: action.code },
      };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

type ComicContextValue = State & {
  total: number;
  index: number;
  open: (file: File) => void;
  openRemote: (comic: RemoteComic) => void;
  close: () => void;
  goTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  mode: ReadingMode;
  setMode: (mode: ReadingMode) => void;
  rtl: boolean;
  setRtl: (rtl: boolean) => void;
  spread: boolean;
  setSpread: (spread: boolean) => void;
  rail: boolean;
  setRail: (rail: boolean) => void;
  chrome: boolean;
  setChrome: (chrome: boolean) => void;
  strip: number;
  cycleStrip: () => void;
};

const ComicContext = createContext<ComicContextValue | null>(null);

/**
 * Drops a page URL the reader is done with.
 *
 * Only object URLs are ours to revoke. A remote page is a plain address on
 * someone else's server: dropping it from the retention window means letting
 * the browser cache decide, not revoking anything.
 */
function release(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

/**
 * A remote page's stand-in for an archive entry name. Only ever shown to a
 * screen reader, and never the URL itself, which is neither short nor useful.
 */
function pageName(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)) || url;
  } catch {
    return url;
  }
}

/**
 * Rail width in CSS pixels, doubled so the thumbnail still holds up on a
 * retina screen. Must be one of the sizes `next.config.ts` allows.
 */
const THUMB_WIDTH = 96;

/**
 * A thumbnail for a remote page.
 *
 * Routed through the image optimiser rather than pointing the rail at the page
 * itself: a chapter's pages are ~1 MB each, and twenty of those behind a strip
 * of 48px boxes is the exact memory-and-bandwidth cost the retention window
 * exists to avoid. This asks the server for a 96px copy instead — which also
 * means the rail loads from this origin, with no third-party request per
 * thumbnail.
 */
function thumbUrl(url: string): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${THUMB_WIDTH}&q=60`;
}

export function ComicProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [index, setIndex] = useState(0);

  const { mode, rtl, spread, rail, chrome, strip } = useSyncExternalStore(
    subscribePrefs,
    getPrefs,
    getServerPrefs,
  );
  const setMode = useCallback((next: ReadingMode) => setPrefs({ mode: next }), []);
  const setRtl = useCallback((next: boolean) => setPrefs({ rtl: next }), []);
  const setSpread = useCallback((next: boolean) => setPrefs({ spread: next }), []);
  const setRail = useCallback((next: boolean) => setPrefs({ rail: next }), []);
  const setChrome = useCallback((next: boolean) => setPrefs({ chrome: next }), []);
  const cycleStrip = useCallback(
    () => setPrefs({ strip: nextStripWidth(getPrefs().strip) }),
    [],
  );

  const workerRef = useRef<Worker | null>(null);
  /**
   * Page URLs of an open remote comic, or null while reading a local file.
   * Also what tells the retention window which of the two it is driving.
   */
  const remoteRef = useRef<string[] | null>(null);
  /** Full-size page URLs currently held, keyed by page index. */
  const residentRef = useRef(new Map<number, string>());
  /** Thumbnail object URLs; small enough to keep for the whole session. */
  const thumbsRef = useRef(new Map<number, string>());
  const resumeRef = useRef(0);

  const releaseAll = useCallback(() => {
    for (const url of residentRef.current.values()) release(url);
    for (const url of thumbsRef.current.values()) release(url);
    residentRef.current.clear();
    thumbsRef.current.clear();
  }, []);

  const teardown = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    remoteRef.current = null;
    releaseAll();
  }, [releaseAll]);

  // The worker holds the entire archive buffer, so it must not outlive the
  // provider.
  useEffect(() => teardown, [teardown]);

  const total = state.pages.length;

  // Keep a bounded window of pages resident: request what's missing, revoke
  // what has drifted out of reach.
  useEffect(() => {
    const worker = workerRef.current;
    const remote = remoteRef.current;
    if ((!worker && !remote) || state.status !== "ready" || !total) return;

    const size = retentionWindow();
    // Scrolling shows several pages at once and is as likely to be going back
    // up as down, so the window sits more evenly around the current page.
    const behind =
      mode === "scroll"
        ? Math.max(3, Math.floor(size / 3))
        : Math.max(2, Math.floor(size / 4));
    const first = Math.max(0, index - behind);
    const last = Math.min(total - 1, index + (size - behind));

    // Ask outward from the current page so the next turn resolves first.
    const missing: number[] = [];
    for (let i = index; i <= last; i++) {
      if (!residentRef.current.has(i)) missing.push(i);
    }
    for (let i = index - 1; i >= first; i--) {
      if (!residentRef.current.has(i)) missing.push(i);
    }
    if (missing.length) {
      if (remote) {
        // Nothing to decode: attaching the URL is what "loading" means here,
        // and the browser fetches it when the image element asks for it.
        for (const at of missing) {
          const url = remote[at];
          if (!url) continue;
          residentRef.current.set(at, url);
          dispatch({ type: "page", index: at, url });
        }
      } else if (worker) {
        worker.postMessage({ type: "need", indices: missing } satisfies WorkerRequest);
      }
    }

    const evicted: number[] = [];
    for (const [held, url] of residentRef.current) {
      if (held < first || held > last) {
        release(url);
        residentRef.current.delete(held);
        evicted.push(held);
      }
    }
    if (evicted.length) dispatch({ type: "evict", indices: evicted });
  }, [index, total, state.status, mode]);

  // Remember where the reader left off, under the file's name.
  useEffect(() => {
    if (!state.fileName || state.status !== "ready" || !total) return;
    rememberSpot(state.fileName, index, total, Date.now(), state.source);
  }, [index, state.fileName, state.source, state.status, total]);

  const open = useCallback(
    (file: File) => {
      teardown();
      setIndex(0);

      // Keyed by name only, so the position survives the file being moved or
      // downloaded again.
      const resume = recallSpot(file.name)?.index ?? 0;
      resumeRef.current = resume;

      dispatch({ type: "open", fileName: file.name, source: null });

      const worker = new Worker(new URL("./decoder.worker.ts", import.meta.url), {
        type: "module",
        name: "flowless-decoder",
      });
      workerRef.current = worker;

      worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        switch (message.type) {
          case "meta": {
            dispatch({ type: "meta", format: message.format, pages: message.pages });
            const start = Math.min(resumeRef.current, message.pages.length - 1);
            if (start > 0) setIndex(start);
            break;
          }
          case "page": {
            // A page can arrive after the reader has already moved past it.
            const url = URL.createObjectURL(
              new Blob([message.bytes], { type: message.mime }),
            );
            const previous = residentRef.current.get(message.index);
            if (previous) release(previous);
            residentRef.current.set(message.index, url);
            dispatch({ type: "page", index: message.index, url });
            break;
          }
          case "thumb": {
            if (thumbsRef.current.has(message.index)) break;
            const url = URL.createObjectURL(
              new Blob([message.bytes], { type: message.mime }),
            );
            thumbsRef.current.set(message.index, url);
            dispatch({
              type: "thumb",
              index: message.index,
              url,
              ratio: message.height ? message.width / message.height : null,
            });
            break;
          }
          case "thumbs-progress":
            dispatch({ type: "thumbs-progress", ready: message.ready });
            break;
          case "error":
            dispatch({
              type: "error",
              message: message.message,
              code: message.code,
            });
            break;
        }
      });

      worker.addEventListener("error", (event) => {
        dispatch({
          type: "error",
          message: event.message || "O decodificador parou inesperadamente.",
          code: "unknown",
        });
      });

      worker.postMessage({
        type: "open",
        file,
        startIndex: resume,
      } satisfies WorkerRequest);
    },
    [teardown],
  );

  /**
   * Opens a comic whose pages already exist as images on the web.
   *
   * No worker, because there is no archive: the page list is known up front, so
   * the comic is ready immediately and the retention window fills it in from
   * the current page outwards, exactly as it does for a decoded one.
   */
  const openRemote = useCallback(
    (comic: RemoteComic) => {
      teardown();
      setIndex(0);

      dispatch({ type: "open", fileName: comic.name, source: comic.source });

      if (!comic.pages.length) {
        dispatch({
          type: "error",
          message: "Esse capítulo veio sem páginas.",
          code: "no-pages",
        });
        return;
      }

      remoteRef.current = comic.pages;
      dispatch({ type: "remote", pages: comic.pages });

      const resume = recallSpot(comic.name)?.index ?? 0;
      setIndex(Math.max(0, Math.min(comic.pages.length - 1, resume)));
    },
    [teardown],
  );

  const close = useCallback(() => {
    teardown();
    setIndex(0);
    dispatch({ type: "reset" });
  }, [teardown]);

  const goTo = useCallback(
    (next: number) => {
      setIndex((current) => {
        if (!total) return current;
        return Math.max(0, Math.min(total - 1, next));
      });
    },
    [total],
  );

  // A spread turns two pages at a time; scrolling always moves one, since the
  // reader can see both anyway.
  const step = spread && mode === "page" ? 2 : 1;
  const next = useCallback(() => goTo(index + step), [goTo, index, step]);
  const previous = useCallback(() => goTo(index - step), [goTo, index, step]);

  const value = useMemo<ComicContextValue>(
    () => ({
      ...state,
      total,
      index,
      open,
      openRemote,
      close,
      goTo,
      next,
      previous,
      mode,
      setMode,
      rtl,
      setRtl,
      spread,
      setSpread,
      rail,
      setRail,
      chrome,
      setChrome,
      strip,
      cycleStrip,
    }),
    [
      state,
      total,
      index,
      open,
      openRemote,
      close,
      goTo,
      next,
      previous,
      mode,
      setMode,
      rtl,
      setRtl,
      spread,
      setSpread,
      rail,
      setRail,
      chrome,
      setChrome,
      strip,
      cycleStrip,
    ],
  );

  return <ComicContext.Provider value={value}>{children}</ComicContext.Provider>;
}

export function useComic() {
  const context = useContext(ComicContext);
  if (!context) {
    throw new Error("useComic must be used inside <ComicProvider>");
  }
  return context;
}


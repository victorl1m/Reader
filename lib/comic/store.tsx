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
  WorkerRequest,
  WorkerResponse,
} from "./types";
import {
  getPrefs,
  getServerPrefs,
  setPrefs,
  subscribePrefs,
  type FitMode,
} from "./prefs";

export type { FitMode };

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
  fileName: string | null;
  fileKey: string | null;
  format: ArchiveFormat | null;
  pages: Page[];
  thumbsReady: number;
  error: { message: string; code: ComicErrorCode } | null;
};

const initialState: State = {
  status: "idle",
  fileName: null,
  fileKey: null,
  format: null,
  pages: [],
  thumbsReady: 0,
  error: null,
};

type Action =
  | { type: "open"; fileName: string; fileKey: string }
  | { type: "meta"; format: ArchiveFormat; pages: string[] }
  | { type: "page"; index: number; url: string }
  | { type: "thumb"; index: number; url: string }
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
        fileKey: action.fileKey,
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
      pages[action.index] = { ...page, thumb: action.url };
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
  close: () => void;
  goTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  fit: FitMode;
  setFit: (fit: FitMode) => void;
  rtl: boolean;
  setRtl: (rtl: boolean) => void;
  spread: boolean;
  setSpread: (spread: boolean) => void;
};

const ComicContext = createContext<ComicContextValue | null>(null);

const POSITION_PREFIX = "flowless:position:v1:";
const positionKey = (fileKey: string) => `${POSITION_PREFIX}${fileKey}`;
/** Cap on remembered reading positions, so storage can't grow without bound. */
const MAX_REMEMBERED_POSITIONS = 100;

function rememberPosition(fileKey: string, index: number) {
  try {
    localStorage.setItem(positionKey(fileKey), JSON.stringify({ index, at: Date.now() }));

    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith(POSITION_PREFIX),
    );
    if (keys.length <= MAX_REMEMBERED_POSITIONS) return;

    // Drop the least recently read entries.
    const aged = keys
      .map((key) => {
        try {
          return { key, at: JSON.parse(localStorage.getItem(key) ?? "{}").at ?? 0 };
        } catch {
          return { key, at: 0 };
        }
      })
      .sort((a, b) => a.at - b.at);

    for (const { key } of aged.slice(0, keys.length - MAX_REMEMBERED_POSITIONS)) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage being unavailable only costs the resume feature.
  }
}

function recallPosition(fileKey: string): number {
  try {
    const raw = localStorage.getItem(positionKey(fileKey));
    if (!raw) return 0;
    const value = JSON.parse(raw) as { index?: unknown };
    return typeof value.index === "number" && value.index > 0 ? value.index : 0;
  } catch {
    return 0;
  }
}

export function ComicProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [index, setIndex] = useState(0);

  const { fit, rtl, spread } = useSyncExternalStore(
    subscribePrefs,
    getPrefs,
    getServerPrefs,
  );
  const setFit = useCallback((next: FitMode) => setPrefs({ fit: next }), []);
  const setRtl = useCallback((next: boolean) => setPrefs({ rtl: next }), []);
  const setSpread = useCallback((next: boolean) => setPrefs({ spread: next }), []);

  const workerRef = useRef<Worker | null>(null);
  /** Full-size object URLs currently held, keyed by page index. */
  const residentRef = useRef(new Map<number, string>());
  /** Thumbnail object URLs; small enough to keep for the whole session. */
  const thumbsRef = useRef(new Map<number, string>());
  const resumeRef = useRef(0);

  const releaseAll = useCallback(() => {
    for (const url of residentRef.current.values()) URL.revokeObjectURL(url);
    for (const url of thumbsRef.current.values()) URL.revokeObjectURL(url);
    residentRef.current.clear();
    thumbsRef.current.clear();
  }, []);

  const teardown = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
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
    if (!worker || state.status !== "ready" || !total) return;

    const size = retentionWindow();
    const behind = Math.max(2, Math.floor(size / 4));
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
      worker.postMessage({ type: "need", indices: missing } satisfies WorkerRequest);
    }

    const evicted: number[] = [];
    for (const [held, url] of residentRef.current) {
      if (held < first || held > last) {
        URL.revokeObjectURL(url);
        residentRef.current.delete(held);
        evicted.push(held);
      }
    }
    if (evicted.length) dispatch({ type: "evict", indices: evicted });
  }, [index, total, state.status]);

  // Remember where the reader left off, per archive.
  useEffect(() => {
    if (!state.fileKey || state.status !== "ready") return;
    rememberPosition(state.fileKey, index);
  }, [index, state.fileKey, state.status]);

  const open = useCallback(
    (file: File) => {
      teardown();
      setIndex(0);

      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      const resume = recallPosition(fileKey);
      resumeRef.current = resume;

      dispatch({ type: "open", fileName: file.name, fileKey });

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
            if (previous) URL.revokeObjectURL(previous);
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
            dispatch({ type: "thumb", index: message.index, url });
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

  const step = spread ? 2 : 1;
  const next = useCallback(() => goTo(index + step), [goTo, index, step]);
  const previous = useCallback(() => goTo(index - step), [goTo, index, step]);

  const value = useMemo<ComicContextValue>(
    () => ({
      ...state,
      total,
      index,
      open,
      close,
      goTo,
      next,
      previous,
      fit,
      setFit,
      rtl,
      setRtl,
      spread,
      setSpread,
    }),
    [
      state,
      total,
      index,
      open,
      close,
      goTo,
      next,
      previous,
      fit,
      setFit,
      rtl,
      setRtl,
      spread,
      setSpread,
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

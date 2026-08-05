"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useComic } from "@/lib/comic/store";
import { FileDrop } from "./file-drop";
import { PageRail } from "./page-rail";
import { PageScroller, type ScrollerHandle } from "./page-scroller";
import { PageViewport } from "./page-viewport";
import { ReaderToolbar } from "./reader-toolbar";
import { Logo } from "@/components/brand/logo";

/**
 * Below this width a two-page spread puts each page at postage-stamp size, so
 * the mode is hidden rather than offered and then fought with.
 */
const WIDE_MIN_WIDTH = 720;

function useIsWide() {
  const [isWide, setIsWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${WIDE_MIN_WIDTH}px)`);
    const update = () => setIsWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isWide;
}

export function Reader() {
  const {
    status,
    fileName,
    pages,
    total,
    thumbsReady,
    index,
    error,
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
  } = useComic();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<ScrollerHandle>(null);

  const isWide = useIsWide();
  const reading = status === "ready";
  const scrolling = mode === "scroll";
  // A spread only exists in paged mode, and only where two pages side by side
  // are still readable.
  const canSpread = isWide && !scrolling;
  const spreadActive = spread && canSpread;


  // Lock document scrolling while the reader owns the viewport.
  useEffect(() => {
    if (!reading) return;
    document.body.dataset.reading = "true";
    return () => {
      delete document.body.dataset.reading;
    };
  }, [reading]);

  // Reading a page takes longer than the screen timeout on most phones.
  useEffect(() => {
    if (!reading || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Denied by policy or battery saver; reading still works.
      }
    };

    void acquire();
    // The lock is dropped whenever the tab is hidden, so it must be retaken.
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [reading]);

  // Everything below is expressed in *screen* directions, because that's what
  // the reader is actually pressing. In RTL (manga) order the left-hand side of
  // the page advances the story, so the two sides swap.
  const goLeft = useCallback(() => (rtl ? next() : previous()), [rtl, next, previous]);
  const goRight = useCallback(() => (rtl ? previous() : next()), [rtl, next, previous]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void shellRef.current?.requestFullscreen?.().catch(() => {
        // Fullscreen can be blocked by policy; the reader still works.
      });
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!reading) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // The listener is on `window`, so the target isn't always an Element.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          goRight();
          break;
        case "ArrowLeft":
          event.preventDefault();
          goLeft();
          break;
        // Down the strip in scroll mode, on to the next page otherwise. A whole
        // page per keypress is the wrong unit when the pages are joined up.
        case "ArrowDown":
        case "PageDown":
        case " ":
          event.preventDefault();
          if (scrolling) scrollerRef.current?.scrollByScreen(0.9);
          else next();
          break;
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          if (scrolling) scrollerRef.current?.scrollByScreen(-0.9);
          else previous();
          break;
        case "Home":
          event.preventDefault();
          goTo(0);
          break;
        case "End":
          event.preventDefault();
          goTo(total - 1);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "s":
          if (canSpread) setSpread(!spread);
          break;
        case "d":
          setRtl(!rtl);
          break;
        case "t":
          setRail(!rail);
          break;
        case "v":
          setMode(scrolling ? "page" : "scroll");
          break;
        case "w":
          if (scrolling) cycleStrip();
          break;
        case "Escape":
          setChrome(true);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    reading,
    rtl,
    spread,
    canSpread,
    scrolling,
    rail,
    total,
    goLeft,
    goRight,
    next,
    previous,
    goTo,
    toggleFullscreen,
    setSpread,
    setRtl,
    setRail,
    setChrome,
    setMode,
    cycleStrip,
  ]);

  if (status === "idle") {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8 px-5 py-12 text-center sm:px-6 sm:py-16">
        <Logo size={40} />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Nada aberto ainda</h1>
          <p className="text-muted">
            Escolha um arquivo de quadrinho e ele abre aqui mesmo.
          </p>
        </div>
        <FileDrop />
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 px-5 py-12 text-center sm:px-6 sm:py-16">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-2xl text-brand"
          aria-hidden
        >
          !
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Esse aí não abriu</h1>
          <p role="alert" className="text-muted">
            {error?.message}
          </p>
          {error?.code === "encrypted" ? (
            <p className="text-sm text-muted">
              O Flowless não abre arquivos protegidos por senha. Salve de novo sem
              senha e tente outra vez.
            </p>
          ) : null}
        </div>
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-black transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Tentar outro arquivo
        </Link>
      </main>
    );
  }

  if (status === "opening" || total === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full w-1/3 rounded-full bg-brand animate-flow-sweep" />
        </div>
        <p className="max-w-full truncate text-sm text-muted" role="status">
          Abrindo {fileName}…
        </p>
      </main>
    );
  }

  // A spread shows the current page plus the next one, in visual order.
  const visible = spreadActive && index + 1 < total ? [index, index + 1] : [index];
  const ordered = rtl ? [...visible].reverse() : visible;

  return (
    <div
      ref={shellRef}
      data-fullscreen={isFullscreen ? "true" : undefined}
      className="fixed inset-0 flex flex-col bg-background"
    >
      {chrome ? (
        <ReaderToolbar
          fileName={fileName ?? ""}
          index={index}
          total={total}
          thumbsReady={thumbsReady}
          mode={mode}
          setMode={setMode}
          rtl={rtl}
          setRtl={setRtl}
          spread={spread}
          setSpread={setSpread}
          railOpen={rail}
          setRailOpen={setRail}
          onFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          canSpread={canSpread}
          strip={strip}
          cycleStrip={cycleStrip}
          canStrip={isWide}
        />
      ) : null}

      {scrolling ? (
        <PageScroller
          ref={scrollerRef}
          pages={pages}
          index={index}
          strip={isWide ? strip : 1}
          onIndexChange={goTo}
          onTapCentre={() => setChrome(!chrome)}
        />
      ) : (
        <PageViewport
          pages={ordered.map((pageIndex) => pages[pageIndex])}
          currentIndex={index}
          onSwipeLeft={goRight}
          onSwipeRight={goLeft}
          onTapLeft={goLeft}
          onTapRight={goRight}
          onTapCentre={() => setChrome(!chrome)}
        />
      )}

      {chrome && rail ? (
        <PageRail pages={pages} index={index} rtl={rtl} onSelect={goTo} />
      ) : null}

      {/* When the chrome is hidden there is no visible way back, so leave one
          affordance that doesn't cover the art. */}
      {!chrome ? (
        <button
          type="button"
          onClick={() => setChrome(true)}
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-black/55 px-3 py-2 text-xs text-white backdrop-blur"
        >
          {index + 1}/{total}
        </button>
      ) : null}

      {/* Page turns are silent to a screen reader without this. */}
      <div aria-live="polite" aria-atomic className="sr-only">
        {visible.length > 1
          ? `Páginas ${index + 1} e ${index + 2} de ${total}`
          : `Página ${index + 1} de ${total}`}
      </div>
    </div>
  );
}

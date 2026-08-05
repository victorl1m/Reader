"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Page } from "@/lib/comic/types";

/**
 * Continuous vertical reading: the whole book as one strip.
 *
 * Unlike the paged viewport, this mode leans on native scrolling. That is the
 * point of it. Momentum, scroll anchoring and the scrollbar are all things the
 * browser does better than a hand-rolled transform, and a reader who wants to
 * drift down a page rather than snap between them wants exactly those.
 *
 * Two things keep it honest:
 *
 * - **Every page reserves its box before it decodes.** The aspect ratio comes
 *   from the thumbnail pass, which runs far ahead of full-size decoding, so a
 *   page arriving swaps into a hole of the right shape instead of shoving the
 *   rest of the strip down.
 * - **The current page is derived from the scroll position**, not stored. Which
 *   page is "current" is whatever crosses the middle of the viewport, so the
 *   counter, the rail and the saved position follow the reader's eye. Jumps
 *   arriving from outside (the rail, a keypress) scroll here instead.
 */

const GAP = 8;
/** Shape assumed for a page whose thumbnail hasn't been built yet. */
const ASSUMED_RATIO = 1300 / 2000;
const TAP_SLOP = 10;
const TAP_MS = 400;

export type ScrollerHandle = {
  /** Scrolls by a fraction of the viewport height, the way a spacebar should. */
  scrollByScreen: (fraction: number) => void;
};

export function PageScroller({
  pages,
  index,
  strip,
  ref,
  onIndexChange,
  onTapCentre,
}: {
  pages: Page[];
  /** Page the rest of the app considers current; a change scrolls to it. */
  index: number;
  /** Strip width as a fraction of the viewport. */
  strip: number;
  ref: RefObject<ScrollerHandle | null>;
  onIndexChange: (index: number) => void;
  onTapCentre: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef(new Map<number, HTMLElement>());
  /** Natural ratios measured from decoded pages, which beat the thumbnail's. */
  const [measured, setMeasured] = useState<Record<number, number>>({});

  /**
   * The page the scroll position currently points at.
   *
   * Held in a ref rather than state because it exists to tell the two
   * directions apart: if `index` differs from this, the change came from
   * elsewhere and needs a scroll; if it matches, the reader scrolled here.
   */
  const observed = useRef(-1);
  const landed = useRef(false);

  useImperativeHandle(ref, () => ({
    scrollByScreen(fraction: number) {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollBy({ top: element.clientHeight * fraction, behavior: "smooth" });
    },
  }));

  const registerSlot = useCallback((pageIndex: number, node: HTMLElement | null) => {
    if (node) slotsRef.current.set(pageIndex, node);
    else slotsRef.current.delete(pageIndex);
  }, []);

  // Whichever page crosses the middle of the viewport is the current one. A
  // margin that collapses the root to a line is cheaper and steadier than
  // measuring offsets on every scroll event, and it doesn't care that page
  // heights change as images decode.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pages.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((entry) => entry.isIntersecting);
        if (!hit) return;
        const at = Number((hit.target as HTMLElement).dataset.pageIndex);
        if (Number.isNaN(at) || at === observed.current) return;
        observed.current = at;
        onIndexChange(at);
      },
      { root, rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );

    for (const node of slotsRef.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [pages.length, onIndexChange]);

  // Follow a jump that came from outside this component: the rail, a keypress,
  // or the resumed position on open.
  useEffect(() => {
    if (landed.current && index === observed.current) return;
    const slot = slotsRef.current.get(index);
    if (!slot) return;

    // Instant, not smooth: an animated scroll across 200 pages would report
    // every page it passed as the current one.
    slot.scrollIntoView({ block: "start", behavior: "auto" });
    observed.current = index;
    landed.current = true;
  }, [index, pages.length]);

  // A tap that isn't a scroll toggles the chrome, matching the paged viewport.
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    touch.current = { x: event.clientX, y: event.clientY, at: performance.now() };
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved <= TAP_SLOP && performance.now() - start.at < TAP_MS) onTapCentre();
  };

  return (
    <main
      ref={scrollRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      // A touch that turns into a scroll is cancelled rather than released, and
      // must not count as a tap.
      onPointerCancel={() => {
        touch.current = null;
      }}
      className="scrollbar-slim relative flex-1 overflow-y-auto overflow-x-hidden bg-stage"
      style={{ overscrollBehavior: "contain" }}
    >
      <div
        className="mx-auto flex flex-col"
        style={{ width: `${strip * 100}%`, gap: GAP }}
      >
        {pages.map((page) => (
          <div
            key={page.index}
            ref={(node) => registerSlot(page.index, node)}
            data-page-index={page.index}
            style={{ aspectRatio: measured[page.index] ?? page.ratio ?? ASSUMED_RATIO }}
            className="relative w-full shrink-0 bg-surface"
          >
            {page.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={page.url}
                alt={`Página ${page.index + 1}`}
                // `object-contain` only matters for the frame between the image
                // loading and its real ratio reaching the slot around it.
                className="block h-full w-full select-none object-contain"
                draggable={false}
                decoding="async"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (!image.naturalWidth || !image.naturalHeight) return;
                  const ratio = image.naturalWidth / image.naturalHeight;
                  setMeasured((current) =>
                    current[page.index] === ratio
                      ? current
                      : { ...current, [page.index]: ratio },
                  );
                }}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                role="status"
                aria-label={`Página ${page.index + 1} ainda está carregando`}
              >
                <div className="h-1 w-1/4 overflow-hidden rounded-full bg-surface-raised">
                  <div className="h-full w-1/3 rounded-full bg-brand animate-flow-sweep" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

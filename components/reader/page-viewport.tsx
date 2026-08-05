"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Page } from "@/lib/comic/types";

/**
 * The reading surface: a pan-and-zoom viewport rather than a scrolling box.
 *
 * Owning the transform (instead of leaning on native scroll plus the browser's
 * own pinch-zoom) is what makes the gestures predictable: a pinch zooms about
 * the point between your fingers, a drag pans within real bounds, and a
 * horizontal flick turns the page only when panning can't consume it.
 *
 * The transform is *derived*, never stored. State holds only what the user did
 * — a zoom multiplier over the fitted size, and a pan offset — so a page that
 * finishes decoding, a rotated phone or a changed fit mode all re-fit on their
 * own instead of needing an effect to chase them.
 */

const GAP = 8;
/** Assumed shape of a page whose image hasn't decoded yet. */
const ASSUMED = { w: 1300, h: 2000 };
const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 32;
const SWIPE_DISTANCE = 56;
const TAP_SLOP = 10;

type Size = { w: number; h: number };
type Point = { x: number; y: number };

const spanBetween = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function PageViewport({
  pages,
  currentIndex,
  onSwipeLeft,
  onSwipeRight,
  onTapLeft,
  onTapRight,
  onTapCentre,
}: {
  /** Pages to lay out side by side, already in visual order. */
  pages: (Page | undefined)[];
  /** Re-fits the view whenever the reader moves to a different page. */
  currentIndex: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onTapLeft: () => void;
  onTapRight: () => void;
  onTapCentre: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 });
  const [natural, setNatural] = useState<Record<number, Size>>({});

  // What the user did, on top of the fitted view.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  // Re-fit on every page turn. Adjusting state during render is React's
  // supported way to reset on a prop change; an effect would render the old
  // view for a frame first.
  const resetKey = String(currentIndex);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setStage({ w: box.width, h: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // --- derived geometry -------------------------------------------------

  const sizes = pages.map((page) =>
    page && natural[page.index] ? natural[page.index] : ASSUMED,
  );
  const contentW =
    sizes.reduce((sum, size) => sum + size.w, 0) + GAP * Math.max(0, sizes.length - 1);
  const contentH = sizes.reduce((max, size) => Math.max(max, size.h), 0);

  // Always "contain". There is no fit mode to pick any more: pinch-zoom does
  // the job better, and unlike a mode it resets on every page turn instead of
  // following the reader through the book.
  const baseScale =
    !stage.w || !stage.h || !contentW || !contentH
      ? 1
      : Math.min(stage.w / contentW, stage.h / contentH);

  const scale = baseScale * zoom;
  const renderedW = contentW * scale;
  const renderedH = contentH * scale;

  // Content smaller than the viewport is centred; larger content is clamped so
  // it can never be dragged away from the edges.
  const offsetX =
    renderedW <= stage.w
      ? (stage.w - renderedW) / 2
      : Math.min(0, Math.max(stage.w - renderedW, pan.x));
  const offsetY =
    renderedH <= stage.h
      ? (stage.h - renderedH) / 2
      : Math.min(0, Math.max(stage.h - renderedH, pan.y));

  const zoomed = zoom > 1.01;
  /**
   * Whether a sideways drag has somewhere to go.
   *
   * This, not the zoom multiplier, decides what a horizontal gesture means. A
   * page can overflow the viewport without the reader having pinched at all
   * (actual size, or a wide spread), and in that state a swipe must pan the
   * page rather than skip past the part they were trying to reach.
   */
  const canPanX = renderedW > stage.w + 1;

  const localPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  /** Zooms to `nextZoom`, keeping the point under the fingers/cursor still. */
  const zoomAbout = useCallback(
    (nextZoom: number, focal: Point) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
      const ratio = (baseScale * clamped) / scale;
      setZoom(clamped);
      setPan({
        x: focal.x - (focal.x - offsetX) * ratio,
        y: focal.y - (focal.y - offsetY) * ratio,
      });
    },
    [baseScale, scale, offsetX, offsetY],
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // --- gestures ---------------------------------------------------------

  const pointers = useRef(new Map<number, Point>());
  const drag = useRef<{
    start: Point;
    last: Point;
    moved: boolean;
    at: number;
  } | null>(null);
  const pinch = useRef<{ span: number; zoom: number } | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  /** Set when a gesture happened, so the tap zone underneath doesn't fire. */
  const suppressClick = useRef(false);

  const onPointerDown = (event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { span: spanBetween(a, b), zoom };
      drag.current = null;
      return;
    }

    drag.current = { start: point, last: point, moved: false, at: performance.now() };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    // Two fingers: pinch about the midpoint.
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const span = spanBetween(a, b);
      if (pinch.current.span > 0) {
        suppressClick.current = true;
        zoomAbout(
          (pinch.current.zoom * span) / pinch.current.span,
          localPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
        );
      }
      return;
    }

    const state = drag.current;
    if (!state) return;

    if (
      !state.moved &&
      Math.hypot(point.x - state.start.x, point.y - state.start.y) > TAP_SLOP
    ) {
      state.moved = true;
      suppressClick.current = true;
    }
    if (!state.moved) return;

    // Panning only means anything once the content overflows the viewport.
    if (renderedW > stage.w + 1 || renderedH > stage.h + 1) {
      setPan({
        x: offsetX + (point.x - state.last.x),
        y: offsetY + (point.y - state.last.y),
      });
    }
    state.last = point;
  };

  const endPointer = (event: React.PointerEvent) => {
    const wasPinching = pointers.current.size >= 2;
    pointers.current.delete(event.pointerId);

    if (wasPinching) {
      pinch.current = null;
      // Re-baseline the finger still down so the page doesn't jump.
      const remaining = [...pointers.current.values()][0];
      drag.current = remaining
        ? { start: remaining, last: remaining, moved: true, at: performance.now() }
        : null;
      return;
    }

    const state = drag.current;
    drag.current = null;
    if (!state) return;

    const dx = event.clientX - state.start.x;
    const dy = event.clientY - state.start.y;

    // A flick turns the page, but only when there is nothing to pan sideways.
    if (state.moved) {
      if (
        !canPanX &&
        Math.abs(dx) > SWIPE_DISTANCE &&
        Math.abs(dx) > Math.abs(dy) * 1.2
      ) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      }
      return;
    }

    // Double tap toggles between fitted and a comfortable reading zoom.
    const now = performance.now();
    const point = localPoint(event.clientX, event.clientY);
    const previous = lastTap.current;
    if (
      previous &&
      now - previous.at < DOUBLE_TAP_MS &&
      spanBetween(point, previous.point) < DOUBLE_TAP_SLOP
    ) {
      lastTap.current = null;
      suppressClick.current = true;
      if (zoomed) resetZoom();
      else zoomAbout(DOUBLE_TAP_ZOOM, point);
      return;
    }
    lastTap.current = { at: now, point };

    // While zoomed a single tap must not turn the page — it's almost always
    // someone steadying the page, not asking to move on.
    if (zoomed) suppressClick.current = true;
  };

  // Ctrl/⌘ + wheel zooms; a plain wheel pans, which is what a trackpad scroll
  // should do once the page is bigger than the window.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomAbout(
          zoom * Math.exp(-event.deltaY / 260),
          localPoint(event.clientX, event.clientY),
        );
        return;
      }
      if (renderedW <= stage.w + 1 && renderedH <= stage.h + 1) return;
      event.preventDefault();
      setPan({ x: offsetX - event.deltaX, y: offsetY - event.deltaY });
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAbout, localPoint, renderedW, renderedH, stage.w, stage.h, offsetX, offsetY]);

  const onClickCapture = (event: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <main
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClickCapture={onClickCapture}
      className="relative flex-1 overflow-hidden bg-[#0b0b0e]"
      // The viewport owns every gesture, so the browser must not also try to
      // scroll or zoom underneath it.
      style={{ touchAction: "none", overscrollBehavior: "contain" }}
    >
      <div
        className="absolute left-0 top-0 flex items-center"
        style={{
          gap: GAP,
          width: contentW,
          height: contentH,
          transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`,
          transformOrigin: "0 0",
          willChange: "transform",
          // Until the stage has been measured there is no fitted scale to use,
          // and drawing at natural size would flash a hugely magnified page.
          visibility: stage.w && stage.h ? "visible" : "hidden",
        }}
      >
        {pages.map((page, position) =>
          page ? (
            <PageSlot
              key={page.index}
              page={page}
              size={sizes[position]}
              onNatural={(size) =>
                setNatural((current) =>
                  current[page.index]?.w === size.w &&
                  current[page.index]?.h === size.h
                    ? current
                    : { ...current, [page.index]: size },
                )
              }
            />
          ) : null,
        )}
      </div>

      {/* Tap zones for page turning, switched off whenever the page is zoomed
          or wider than the viewport. In that state the sides belong to
          panning, and a tap there would yank the page away from someone
          reading a panel. */}
      <div
        className={`absolute inset-0 flex ${zoomed || canPanX ? "pointer-events-none" : ""}`}
        aria-hidden
      >
        <button
          type="button"
          onClick={onTapLeft}
          tabIndex={-1}
          aria-hidden
          className="h-full w-[28%] cursor-w-resize"
        />
        <button
          type="button"
          onClick={onTapCentre}
          tabIndex={-1}
          aria-hidden
          className="h-full w-[44%] cursor-default"
        />
        <button
          type="button"
          onClick={onTapRight}
          tabIndex={-1}
          aria-hidden
          className="h-full w-[28%] cursor-e-resize"
        />
      </div>

      {zoomed ? (
        <button
          type="button"
          onClick={resetZoom}
          className="absolute bottom-3 right-3 flex min-h-11 items-center rounded-full border border-border-subtle bg-surface/90 px-4 text-sm text-foreground backdrop-blur transition-colors hover:bg-surface-raised"
        >
          {Math.round(zoom * 100)}% · Ajustar
        </button>
      ) : null}
    </main>
  );
}

function PageSlot({
  page,
  size,
  onNatural,
}: {
  page: Page;
  size: Size;
  onNatural: (size: Size) => void;
}) {
  if (!page.url) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-sm bg-surface"
        style={{ width: size.w, height: size.h }}
        role="status"
        aria-label={`Página ${page.index + 1} ainda está carregando`}
      >
        <div className="h-3 w-1/3 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full w-1/3 rounded-full bg-brand animate-flow-sweep" />
        </div>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={page.url}
      alt={`Página ${page.index + 1}`}
      width={size.w}
      height={size.h}
      className="block shrink-0 select-none"
      draggable={false}
      decoding="async"
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth && image.naturalHeight) {
          onNatural({ w: image.naturalWidth, h: image.naturalHeight });
        }
      }}
    />
  );
}

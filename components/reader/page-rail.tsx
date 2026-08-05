"use client";

import { useEffect, useRef } from "react";
import type { Page } from "@/lib/comic/types";

/**
 * Thumbnail strip for jumping around the book.
 *
 * Implemented as a roving-tabindex listbox: a 300-page comic must not put 300
 * stops in the tab order, so Tab reaches the rail once and the arrow keys move
 * within it.
 */
export function PageRail({
  pages,
  index,
  rtl,
  onSelect,
}: {
  pages: Page[];
  index: number;
  rtl: boolean;
  onSelect: (index: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    const active = activeRef.current;
    if (!active) return;
    // The first reveal jumps; later ones animate. Smooth-scrolling on every
    // page turn fights the user's own scrolling on touch devices.
    active.scrollIntoView({
      behavior: hasScrolled.current ? "smooth" : "auto",
      inline: "center",
      block: "nearest",
    });
    hasScrolled.current = true;
  }, [index]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";

    let target: number | null = null;
    if (event.key === forward) target = index + 1;
    else if (event.key === backward) target = index - 1;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = pages.length - 1;
    if (target === null) return;

    event.preventDefault();
    event.stopPropagation();
    onSelect(Math.max(0, Math.min(pages.length - 1, target)));
    // Keep focus on the rail as the selection moves.
    requestAnimationFrame(() => activeRef.current?.focus());
  };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Páginas"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={`scrollbar-slim flex shrink-0 gap-2 overflow-x-auto border-t border-border-subtle bg-surface px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
        rtl ? "flex-row-reverse" : "flex-row"
      }`}
      style={{ overscrollBehaviorX: "contain" }}
    >
      {pages.map((page) => {
        const active = page.index === index;
        return (
          <button
            key={page.index}
            ref={active ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(page.index)}
            aria-label={`Página ${page.index + 1}`}
            className={`relative h-[72px] w-[48px] shrink-0 overflow-hidden rounded-sm border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active
                ? "border-brand opacity-100 ring-1 ring-brand"
                : "border-border-subtle opacity-55 hover:opacity-100"
            }`}
          >
            {page.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.thumb}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface-raised text-[10px] tabular-nums text-muted">
                {page.index + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

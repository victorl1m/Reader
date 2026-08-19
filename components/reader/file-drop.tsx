"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useOpenFile } from "@/lib/comic/use-open-file";
import {
  getIntegrations,
  getServerIntegrations,
  subscribeIntegrations,
} from "@/lib/integrations/prefs";

/**
 * The file input deliberately carries no `accept` filter.
 *
 * Android's picker resolves `accept` entries to MIME types, and `.cbr` maps to
 * nothing there, so real comics were shown greyed out and could not be picked
 * at all. The worker identifies the container by magic bytes anyway, so
 * filtering here only ever removed valid files and never added safety.
 */

/**
 * The entry point for a comic: a click-to-browse target that also accepts a
 * file dropped anywhere on the window, because aiming at a box is a pointless
 * requirement when the page has nothing else on it.
 */
export function FileDrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const { accept, rejected } = useOpenFile();
  const restricted = useSyncExternalStore(
    subscribeIntegrations,
    getIntegrations,
    getServerIntegrations,
  ).libraryOnly;

  // Launched from the manifest shortcut (`/?open=1`): go straight to the
  // picker. Read from `location` rather than `searchParams` so the landing
  // page stays fully static and precacheable.
  useEffect(() => {
    if (restricted) return;
    if (new URLSearchParams(window.location.search).get("open") === "1") {
      inputRef.current?.click();
    }
  }, [restricted]);

  useEffect(() => {
    if (restricted) return;

    // Depth counter: dragenter/dragleave fire for every child element, so a
    // naive boolean flickers as the pointer crosses the inner content.
    let depth = 0;

    const carriesFiles = (event: DragEvent) =>
      Boolean(event.dataTransfer?.types.includes("Files"));

    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth++;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      accept(event.dataTransfer.files[0]);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [restricted, accept]);

  // Someone who only wants the Biblioteca doesn't need a local file picker
  // sitting on the home page — the effects above are skipped too, so a drag
  // from outside doesn't open one either.
  if (restricted) return null;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        aria-label="Escolher um arquivo de quadrinho"
        onChange={(event) => {
          accept(event.target.files?.[0]);
          // Allow re-picking the same file after closing it.
          event.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`group flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-8 py-14 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          dragging
            ? "border-brand bg-brand/10"
            : "border-border-subtle bg-surface hover:border-brand/60 hover:bg-surface-raised"
        }`}
      >
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl transition-transform ${
            dragging
              ? "scale-110 bg-brand text-black"
              : "bg-surface-raised text-brand group-hover:scale-105"
          }`}
          aria-hidden
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="flex flex-col gap-1.5">
          <span className="text-lg font-medium text-foreground">
            {dragging
              ? "Pode soltar em qualquer lugar da tela"
              : "Solte um quadrinho aqui, ou clique para procurar"}
          </span>
          <span className="text-sm text-muted">
            .cbr e .cbz, abertos no seu aparelho e nunca enviados
          </span>
        </span>
      </button>

      {rejected ? (
        <p role="alert" className="text-sm text-brand">
          {rejected}
        </p>
      ) : null}

      {dragging ? (
        <div
          className="pointer-events-none fixed inset-0 z-50 border-4 border-brand/70 bg-brand/5"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import type { ReadingMode } from "@/lib/comic/prefs";

function Icon({ path }: { path: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  spread: "M12 5v14M5 5h14v14H5z",
  single: "M7 4h10v16H7z",
  rtl: "M20 12H4m0 0 6-6m-6 6 6 6",
  ltr: "M4 12h16m0 0-6-6m6 6-6 6",
  pages: "M4 6h4v12H4zm6 0h4v12h-4zm6 0h4v12h-4z",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5",
  exit: "M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5",
  // Stacked pages joined by an arrow: one continuous strip.
  scroll: "M8 3h8M8 21h8M12 7v10m0 0-3-3m3 3 3-3",
  paged: "M6 4h12v16H6z",
  width: "M3 6v12m18-12v12M7 12h10m0 0-3-3m3 3-3 3M7 12l3-3m-3 3 3 3",
};

function ToolButton({
  onClick,
  active,
  label,
  icon,
  text,
  alwaysShowText,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  icon: string;
  /** Shown next to the icon on wide screens, or always with `alwaysShowText`. */
  text?: string;
  alwaysShowText?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
        active
          ? "bg-brand/15 text-brand"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      <Icon path={icon} />
      {text ? (
        <span className={alwaysShowText ? "inline" : "hidden lg:inline"}>{text}</span>
      ) : null}
    </button>
  );
}

export function ReaderToolbar({
  fileName,
  index,
  total,
  thumbsReady,
  mode,
  setMode,
  rtl,
  setRtl,
  spread,
  setSpread,
  railOpen,
  setRailOpen,
  onFullscreen,
  isFullscreen,
  canSpread,
  strip,
  cycleStrip,
  canStrip,
}: {
  fileName: string;
  index: number;
  total: number;
  thumbsReady: number;
  mode: ReadingMode;
  setMode: (mode: ReadingMode) => void;
  rtl: boolean;
  setRtl: (rtl: boolean) => void;
  spread: boolean;
  setSpread: (spread: boolean) => void;
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  /** False in portrait or scroll mode, where a spread makes no sense. */
  canSpread: boolean;
  /** Strip width in scroll mode, as a fraction of the viewport. */
  strip: number;
  cycleStrip: () => void;
  /** False on a narrow screen, where the strip always fills the width. */
  canStrip: boolean;
}) {
  const scrolling = mode === "scroll";
  const preparing = total > 0 && thumbsReady < total;

  return (
    <header
      data-app-bar
      className="relative flex shrink-0 items-center gap-1 border-b border-border-subtle bg-surface px-1 py-1 pt-[max(0.25rem,env(safe-area-inset-top))] sm:px-2"
    >
      <Link
        href="/"
        className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-foreground transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        aria-label="Fechar quadrinho e voltar ao início"
      >
        <LogoMark size={20} />
      </Link>

      <span className="hidden min-w-0 flex-1 truncate text-sm text-muted md:block">
        {fileName}
      </span>

      <span
        className="ml-auto shrink-0 rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs tabular-nums sm:text-sm"
        aria-hidden
      >
        <span className="text-brand">{total ? index + 1 : 0}</span>
        <span className="text-muted">/{total || "0"}</span>
      </span>

      <div className="flex shrink-0 items-center">
        <ToolButton
          onClick={() => setMode(scrolling ? "page" : "scroll")}
          active={scrolling}
          label={scrolling ? "Leitura em rolagem contínua" : "Leitura página por página"}
          icon={scrolling ? ICONS.scroll : ICONS.paged}
          text={scrolling ? "Rolagem" : "Página"}
        />
        {scrolling && canStrip ? (
          <ToolButton
            onClick={cycleStrip}
            label="Largura da tira"
            icon={ICONS.width}
            text={`${Math.round(strip * 100)}%`}
          />
        ) : null}
        {canSpread ? (
          <ToolButton
            onClick={() => setSpread(!spread)}
            active={spread}
            label="Página dupla"
            icon={spread ? ICONS.spread : ICONS.single}
            text={spread ? "Dupla" : "Única"}
          />
        ) : null}
        <ToolButton
          onClick={() => setRtl(!rtl)}
          active={rtl}
          label="Ordem mangá, da direita para a esquerda"
          icon={rtl ? ICONS.rtl : ICONS.ltr}
          text={rtl ? "RTL" : "LTR"}
          alwaysShowText
        />
        <ToolButton
          onClick={() => setRailOpen(!railOpen)}
          active={railOpen}
          label="Miniaturas das páginas"
          icon={ICONS.pages}
          text="Miniaturas"
        />
        <ToolButton
          onClick={onFullscreen}
          active={isFullscreen}
          label="Tela cheia"
          icon={isFullscreen ? ICONS.exit : ICONS.full}
        />
      </div>

      {/* Thumbnail build progress: a hairline that fills, then vanishes. */}
      {preparing ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5" aria-hidden>
          <div
            className="h-full bg-brand transition-[width] duration-200"
            style={{ width: `${Math.round((thumbsReady / total) * 100)}%` }}
          />
        </div>
      ) : null}
    </header>
  );
}

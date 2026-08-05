/**
 * Flowless Reader brand marks.
 *
 * The mark keeps the Flowless DNA — a stroked speech bubble with an orange
 * accent — and swaps the corporate swirl for an open book, so it reads as
 * "comics" rather than "chat". Geometry lives on a 48×48 grid and is mirrored
 * byte-for-byte in `app/icon.svg`; change one, change the other.
 */

const BUBBLE_PATH =
  "M12 7H36A7 7 0 0 1 43 14V30A7 7 0 0 1 36 37H21L12 44.5V37A7 7 0 0 1 5 30V14A7 7 0 0 1 12 7Z";
const PAGE_LEFT_PATH =
  "M23 17.4C20 15 16.6 13.8 12.8 13.8V25.6C16.6 25.6 20 26.8 23 29.2Z";
const PAGE_RIGHT_PATH =
  "M25 17.4C28 15 31.4 13.8 35.2 13.8V25.6C31.4 25.6 28 26.8 25 29.2Z";

export function LogoMark({
  size = 32,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d={BUBBLE_PATH}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path d={PAGE_LEFT_PATH} fill="currentColor" />
      <path d={PAGE_RIGHT_PATH} fill="var(--brand-orange, #ff6a2b)" />
    </svg>
  );
}

export function Wordmark({
  className = "",
  showSub = true,
}: {
  className?: string;
  showSub?: boolean;
}) {
  return (
    <span className={`flex flex-col leading-none ${className}`}>
      <span className="text-[1.05em] font-semibold tracking-tight">
        Flowless
      </span>
      {showSub ? (
        <span className="mt-1 text-[0.62em] font-medium uppercase tracking-[0.22em] text-muted">
          Reader
        </span>
      ) : null}
    </span>
  );
}

export function Logo({
  size = 32,
  showSub = true,
  className = "",
}: {
  size?: number;
  showSub?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`flex items-center gap-3 text-foreground ${className}`}
      style={{ fontSize: Math.round(size * 0.55) }}
    >
      <LogoMark size={size} title="Flowless Reader" />
      <Wordmark showSub={showSub} />
    </span>
  );
}

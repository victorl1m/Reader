"use client";

import Link from "next/link";

const HOME_PATH = "M4 11.5 12 4l8 7.5M6 10v9h5v-5h2v5h5v-9";
const LIBRARY_PATH =
  "M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5v-13ZM20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5v-13Z";

/**
 * The two destinations that matter, reachable with a thumb: this is the
 * primary way to move between them on a narrow screen, so `AppNav`'s
 * horizontal link is hidden there rather than duplicated.
 */
export function MobileTabBar({ active }: { active: "home" | "biblioteca" }) {
  return (
    <nav
      data-app-bar
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <TabLink href="/" label="Início" icon={HOME_PATH} activeHere={active === "home"} />
      <TabLink
        href="/biblioteca"
        label="Biblioteca"
        icon={LIBRARY_PATH}
        activeHere={active === "biblioteca"}
      />
    </nav>
  );
}

function TabLink({
  href,
  label,
  icon,
  activeHere,
}: {
  href: string;
  label: string;
  icon: string;
  activeHere: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activeHere ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
        activeHere ? "text-brand" : "text-muted"
      }`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={icon} />
      </svg>
      {label}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { UpdateHint } from "@/components/pwa/update-hint";
import { SettingsMenu } from "./settings-menu";

/**
 * The header shared by every screen except the reader itself, which owns its
 * own toolbar. Desktop gets a horizontal link to the Biblioteca next to the
 * logo; on a narrow screen that destination moves to `MobileTabBar` instead,
 * so the header stays just the logo and the gear.
 */
export function AppNav({ active }: { active: "home" | "biblioteca" }) {
  return (
    <header
      data-app-bar
      className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-10 sm:py-5"
    >
      <Link
        href="/"
        aria-label="Início"
        className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Logo size={32} />
      </Link>

      <nav className="hidden flex-1 items-center gap-1 pl-4 sm:flex" aria-label="Principal">
        <NavLink href="/biblioteca" activeHere={active === "biblioteca"}>
          Biblioteca
        </NavLink>
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        <UpdateHint />
        <SettingsMenu />
      </div>
    </header>
  );
}

function NavLink({
  href,
  activeHere,
  children,
}: {
  href: string;
  activeHere: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activeHere ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
        activeHere
          ? "bg-brand/15 text-brand"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

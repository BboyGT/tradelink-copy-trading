"use client";

import Link from "next/link";
import { Activity, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/auth-dialog";
import { useNavStore } from "@/lib/nav-store";

export function MarketingSite({ children }: { children: React.ReactNode }) {
  const setAuthOpen = useNavStore((state) => state.setAuthOpen);

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="TRADE LINK home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-mono text-sm font-semibold tracking-wide">TRADE LINK</span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Copy trading workspace</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
            <Link href="/about" className="transition hover:text-foreground">About</Link>
            <Link href="/packages" className="transition hover:text-foreground">Packages</Link>
            <Link href="/" className="transition hover:text-foreground">Workspace</Link>
          </nav>
          <Button onClick={() => setAuthOpen(true)} className="gap-2">
            Sign in or register <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>TRADE LINK. Owner-authorized account monitoring and trade replication.</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/packages" className="hover:text-foreground">Packages</Link>
            <a href="https://github.com/BboyGT/tradelink-copy-trading/issues" target="_blank" rel="noreferrer" className="hover:text-foreground">Support</a>
          </div>
          <span>Trading can result in losses. Past performance is not a promise of future results.</span>
        </div>
      </footer>
      <AuthDialog />
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-3xl">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.24em] text-primary">{eyebrow}</p>
      <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
    </div>
  );
}

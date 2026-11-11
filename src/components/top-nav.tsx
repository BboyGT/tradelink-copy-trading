"use client";

import * as Icons from "lucide-react";
import { useEffect, useState } from "react";
import { useNavStore } from "@/lib/nav-store";
import { NAV_ITEMS } from "@/lib/types";
import type { NavItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Bell, Search, Menu, Activity, ShieldCheck, MoreHorizontal, ChevronDown, LogOut, User as UserIcon, Settings as SettingsIcon } from "lucide-react";

interface TopNavProps {
  user: { email: string; name?: string; role: string } | null;
  unreadNotifications: number;
  connectedBrokers: number;
  onOpenNotifications: () => void;
}

/**
 * Brand mark — TRADE LINK wordmark.
 * Uses the rm-glow-gold pulsing effect on the activity icon for a living feel.
 */
function BrandMark() {
  const setView = useNavStore((s) => s.setView);
  return (
    <button
      onClick={() => setView("dashboard")}
      className="flex items-center gap-2.5 shrink-0 group"
      aria-label="TRADE LINK home"
    >
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 group-hover:border-primary/50 transition-all">
        <Activity className="h-4 w-4 text-primary" />
        {/* Subtle glow on hover */}
        <span className="absolute inset-0 rounded-lg bg-primary/20 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[14px] font-semibold font-mono tracking-tight">TRADE LINK</span>
        <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-muted-foreground/80 mt-0.5">
          Position Terminal
        </span>
      </div>
    </button>
  );
}

function NavTab({
  item,
  active,
  unreadNotifications,
  connectedBrokers,
}: {
  item: NavItem;
  active: boolean;
  unreadNotifications: number;
  connectedBrokers: number;
}) {
  const setView = useNavStore((s) => s.setView);
  const Icon = (Icons as any)[item.icon] ?? Icons.Circle;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          onClick={() => setView(item.id)}
          className={cn(
            "relative flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap group",
            active
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]",
          )}
        >
          <Icon className={cn("h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-110", active && "text-primary")} />
          <span className="tracking-wide">{item.label}</span>
          {/* Active indicator — bottom amber line */}
          {active && (
            <span className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-primary" />
          )}
          {/* Badges */}
          {item.id === "notifications" && unreadNotifications > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[8px] ml-0.5 font-mono">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </Badge>
          )}
          {item.id === "broker_connections" && connectedBrokers > 0 && (
            <span className="flex h-3.5 min-w-3.5 px-1 items-center justify-center rounded-full bg-primary/20 text-primary text-[8px] font-mono tabular-nums">
              {connectedBrokers}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="font-mono text-[10px] uppercase tracking-wider">
        {item.description}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * "More" dropdown — secondary nav items grouped by category.
 */
function MoreDropdown({
  items,
  active,
  unreadNotifications,
  connectedBrokers,
}: {
  items: NavItem[];
  active: boolean;
  unreadNotifications: number;
  connectedBrokers: number;
}) {
  const setView = useNavStore((s) => s.setView);
  const currentView = useNavStore((s) => s.view);

  const groups: { label: string; items: NavItem[] }[] = [
    { label: "Analysis", items: items.filter((i) => ["analytics", "comparison", "backtesting", "trade_history", "watchlists"].includes(i.id)) },
    { label: "Configuration", items: items.filter((i) => ["broker_connections", "instrument_mapping", "notifications", "settings"].includes(i.id)) },
    { label: "System", items: items.filter((i) => i.id === "admin") },
  ].filter((g) => g.items.length > 0);

  const currentItem = items.find((i) => i.id === currentView);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "relative flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap group",
            active
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]",
          )}
        >
          {currentItem ? (
            <>
              {(() => { const I = (Icons as any)[currentItem.icon] ?? Icons.Circle; return <I className="h-3.5 w-3.5 shrink-0 group-hover:scale-110 transition-transform" />; })()}
              <span className="tracking-wide">{currentItem.label}</span>
            </>
          ) : (
            <>
              <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
              <span className="tracking-wide">More</span>
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
          {active && (
            <span className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-primary" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="w-60 rm-glass border-white/10 p-1.5"
        sideOffset={8}
      >
        {groups.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <DropdownMenuSeparator className="bg-white/5 my-1" />}
            <DropdownMenuLabel className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 px-2 py-1.5 mb-0.5">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) => {
              const Icon = (Icons as any)[item.icon] ?? Icons.Circle;
              const itemActive = currentView === item.id;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 cursor-pointer rounded-md text-[12px] transition-all",
                    itemActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04] focus:text-foreground focus:bg-white/[0.04]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  {item.id === "notifications" && unreadNotifications > 0 && (
                    <Badge variant="destructive" className="h-4 px-1 text-[8px] font-mono">
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </Badge>
                  )}
                  {item.id === "broker_connections" && connectedBrokers > 0 && (
                    <span className="text-[9px] text-muted-foreground font-mono tabular-nums">{connectedBrokers}</span>
                  )}
                  {itemActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * User menu — avatar with dropdown for settings / sign out.
 */
function UserMenu({ user }: { user: { email: string; name?: string; role: string } }) {
  const setView = useNavStore((s) => s.setView);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const [signOutFn, setSignOutFn] = useState<(() => Promise<void>) | null>(null);

  // Lazy load signOut from next-auth
  if (!signOutFn) {
    import("next-auth/react").then((mod) => setSignOutFn(() => () => mod.signOut({ callbackUrl: "/" })));
  }

  const initial = (user.name ?? user.email)[0].toUpperCase();
  const displayName = user.name ?? user.email.split("@")[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 h-8 pl-1.5 pr-2.5 rounded-md hover:bg-white/[0.04] transition-colors group">
          <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/40 text-[10px] font-mono font-semibold uppercase text-primary">
            {initial}
          </div>
          <span className="hidden sm:inline text-[11px] font-mono truncate max-w-[120px] text-foreground/80 group-hover:text-foreground">
            {displayName}
          </span>
          <ChevronDown className="h-3 w-3 opacity-40 group-hover:opacity-80 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rm-glass border-white/10 p-1.5"
        sideOffset={8}
      >
        <div className="px-2 py-2 mb-1 border-b border-white/5">
          <div className="text-[12px] font-medium text-foreground truncate">{user.name ?? displayName}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{user.email}</div>
          {user.role === "admin" && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-mono uppercase tracking-wider text-primary">
              <ShieldCheck className="h-2.5 w-2.5" /> Admin
            </span>
          )}
        </div>
        <DropdownMenuItem
          onClick={() => setView("settings")}
          className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] focus:text-foreground focus:bg-white/[0.04]"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => signOutFn?.()}
          className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer rounded-md text-[12px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Built by GT badge — homage to Lotwise.
 */
function BuiltByGTBadge() {
  return (
    <a
      href="https://lotwises.netlify.app/"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-3 right-3 z-[60] group pointer-events-auto"
      aria-label="Design inspired by Lotwise Position Terminal"
      title="Design language inspired by Lotwise Position Terminal — click to visit"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/20 bg-black/60 backdrop-blur-sm text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground hover:text-primary hover:border-primary/40 transition-all hover:shadow-[0_0_20px_rgba(255,184,0,0.2)]">
        <ShieldCheck className="h-3 w-3" />
        <span>Built with Lotwise DNA</span>
      </div>
    </a>
  );
}

export function TopNav({ user, unreadNotifications, connectedBrokers, onOpenNotifications }: TopNavProps) {
  const view = useNavStore((s) => s.view);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Auto-close the mobile nav sheet when the viewport crosses into lg+
  // (desktop breakpoint where the horizontal nav takes over).
  // This makes the transition smooth — the sheet animates closed and the
  // desktop nav fades in, instead of both being visible momentarily.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches && mobileNavOpen) {
        setMobileNavOpen(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mobileNavOpen]);

  const allItems = NAV_ITEMS.filter((i) => i.id !== "admin" || user?.role === "admin");
  const primaryItems = allItems.filter((i) => i.primary);
  const secondaryItems = allItems.filter((i) => !i.primary);
  const isCurrentInSecondary = secondaryItems.some((i) => i.id === view);

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-40 border-b border-border bg-sidebar/95 backdrop-blur-md">
        <div className="flex items-center h-14 px-4 md:px-6 lg:px-8 max-w-[1800px] mx-auto">
          {/* Left: Brand */}
          <div className="flex items-center">
            <BrandMark />
            {/* Subtle vertical separator with breathing room */}
            <div className="hidden lg:block h-6 w-px bg-white/5 mx-3" />
          </div>

          {/* Center: Primary nav — generous gap between tabs */}
          <nav className="hidden lg:flex items-center gap-1.5">
            {primaryItems.map((item) => (
              <NavTab
                key={item.id}
                item={item}
                active={view === item.id}
                unreadNotifications={unreadNotifications}
                connectedBrokers={connectedBrokers}
              />
            ))}
            {secondaryItems.length > 0 && (
              <>
                <div className="h-6 w-px bg-white/5 mx-2" />
                <MoreDropdown
                  items={secondaryItems}
                  active={isCurrentInSecondary}
                  unreadNotifications={unreadNotifications}
                  connectedBrokers={connectedBrokers}
                />
              </>
            )}
          </nav>

          {/* Right: Actions — consistent spacing */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Search button */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:flex h-8 px-3 gap-2 text-muted-foreground hover:text-primary hover:bg-white/[0.04]"
              onClick={() => setView("discover")}
              aria-label="Search providers"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="text-[11px] font-mono uppercase tracking-wider hidden xl:inline">Search</span>
              <kbd className="hidden xl:inline-flex items-center justify-center h-4 px-1.5 rounded text-[9px] font-mono bg-white/5 text-muted-foreground border border-white/10">⌘K</kbd>
            </Button>

            {/* Notifications bell */}
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 text-muted-foreground hover:text-primary hover:bg-white/[0.04]"
              onClick={onOpenNotifications}
              aria-label="Alerts"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 px-1 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[8px] font-mono font-bold ring-2 ring-sidebar">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </Button>

            {/* Vertical separator */}
            <div className="hidden md:block h-6 w-px bg-white/5" />

            {/* Status indicator */}
            <span className="hidden md:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-primary rm-pulse-dot" style={{ background: "var(--primary)" }} />
              <span className="text-muted-foreground">Online</span>
            </span>

            {/* Vertical separator before user */}
            <div className="hidden md:block h-6 w-px bg-white/5" />

            {/* User menu / sign in */}
            {user ? (
              <UserMenu user={user} />
            ) : (
              <Button size="sm" className="h-8" onClick={() => setAuthOpen(true)}>
                Sign in
              </Button>
            )}

            {/* Mobile nav menu trigger */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-8 w-8 ml-1 text-muted-foreground hover:text-primary"
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="top" className="w-full p-0 bg-sidebar border-white/10 max-h-[80vh] overflow-y-auto">
                <SheetHeader className="border-b border-white/10 p-3 sticky top-0 bg-sidebar z-10">
                  <SheetTitle className="font-mono uppercase tracking-wider text-sm">Navigation</SheetTitle>
                </SheetHeader>
                <div className="grid grid-cols-3 gap-2 p-3">
                  {allItems.map((item) => {
                    const Icon = (Icons as any)[item.icon] ?? Icons.Circle;
                    const active = view === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setView(item.id);
                          setMobileNavOpen(false);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-lg transition-all",
                          active
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground border border-transparent",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-center leading-tight">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <BuiltByGTBadge />
    </TooltipProvider>
  );
}

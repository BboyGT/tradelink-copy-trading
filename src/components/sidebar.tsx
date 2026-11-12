"use client";

import { useState } from "react";
import * as Icons from "lucide-react";
import { useNavStore } from "@/lib/nav-store";
import { NAV_ITEMS } from "@/lib/types";
import type { NavItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps {
  user: { email: string; name?: string; role: string } | null;
  unreadNotifications: number;
  connectedBrokers: number;
}

function BrandHeader({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border-b border-sidebar-border",
        collapsed ? "px-2 py-3 justify-center" : "px-3.5 py-3",
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 border border-primary/30 shrink-0">
        <Icons.Activity className="h-3.5 w-3.5 text-primary" />
      </div>
      {!collapsed && (
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold tracking-tight font-mono leading-tight">TRADE LINK</div>
        </div>
      )}
    </div>
  );
}

function UserFooter({ user, collapsed }: { user: SidebarProps["user"]; collapsed: boolean }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);

  if (user) {
    return (
      <div className={cn("border-t border-sidebar-border", collapsed ? "p-1.5" : "p-2")}>
        <button
          onClick={() => setView("settings")}
          className={cn(
            "w-full flex items-center gap-2 rounded-md p-1.5 hover:bg-sidebar-accent/60 transition-colors text-left",
            collapsed && "justify-center",
          )}
          title={user.email}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 border border-primary/30 text-[11px] font-mono font-medium uppercase text-primary shrink-0">
            {(user.name ?? user.email)[0]}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium truncate leading-tight">{user.name ?? user.email}</div>
            </div>
          )}
        </button>
      </div>
    );
  }
  return (
    <div className={cn("border-t border-sidebar-border", collapsed ? "p-1.5" : "p-2")}>
      <Button variant="default" size="sm" className="w-full" onClick={() => setAuthOpen(true)}>
        {collapsed ? <Icons.LogIn className="h-3.5 w-3.5" /> : "Sign in"}
      </Button>
    </div>
  );
}

function NavButton({
  item,
  active,
  unreadNotifications,
  connectedBrokers,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  unreadNotifications: number;
  connectedBrokers: number;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const setView = useNavStore((s) => s.setView);
  const Icon = (Icons as any)[item.icon] ?? Icons.Circle;

  const button = (
    <button
      onClick={() => {
        setView(item.id);
        onNavigate?.();
      }}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md transition-all text-left w-full",
        collapsed ? "justify-center h-9 px-0" : "px-2.5 py-2",
        active
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
      title={collapsed ? item.label : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r bg-primary" />
      )}
      <Icon
        className={cn(
          "shrink-0 transition-colors",
          collapsed ? "h-4 w-4" : "h-4 w-4",
          active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground",
        )}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-[12px] font-medium">{item.label}</span>
          {item.id === "notifications" && unreadNotifications > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[9px] font-mono">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </Badge>
          )}
          {item.id === "broker_connections" && connectedBrokers > 0 && (
            <span className="text-[9px] font-mono text-muted-foreground tabular-nums">{connectedBrokers}</span>
          )}
        </>
      )}
      {collapsed && item.id === "notifications" && unreadNotifications > 0 && (
        <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-sidebar" />
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" className="font-mono text-[11px] uppercase tracking-wider">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }
  return button;
}

function NavList({
  items,
  unreadNotifications,
  connectedBrokers,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  unreadNotifications: number;
  connectedBrokers: number;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const view = useNavStore((s) => s.view);

  return (
    <nav className={cn("flex flex-col gap-0.5", collapsed ? "px-1.5 py-2" : "px-2 py-2")}>
      {items.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={view === item.id}
          unreadNotifications={unreadNotifications}
          connectedBrokers={connectedBrokers}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function Sidebar({ user, unreadNotifications, connectedBrokers }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useNavStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useNavStore((s) => s.toggleSidebar);

  // System administration is kept out of the customer navigation.
  const items = NAV_ITEMS.filter((i) => i.primary);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 z-40",
          collapsed ? "md:w-14" : "md:w-52",
        )}
      >
        <BrandHeader collapsed={collapsed} />
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <NavList
              items={items}
              unreadNotifications={unreadNotifications}
              connectedBrokers={connectedBrokers}
              collapsed={collapsed}
            />
          </ScrollArea>
        </div>

        {/* Collapse toggle */}
        <div className="border-t border-sidebar-border">
          <button
            onClick={toggleSidebar}
            className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-2 text-sidebar-foreground/40 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors",
              collapsed && "justify-center px-0",
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <Icons.PanelLeftClose
              className={cn("h-3.5 w-3.5 shrink-0", collapsed && "rotate-180")}
            />
            {!collapsed && <span className="text-[10px] font-mono uppercase tracking-wider">Collapse</span>}
          </button>
          <UserFooter user={user} collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0 bg-sidebar border-white/10">
          <SheetHeader className="sr-only">
            <SheetTitle>TRADE LINK navigation</SheetTitle>
          </SheetHeader>
          <BrandHeader collapsed={false} />
          <ScrollArea className="flex-1 h-[calc(100vh-9rem)]">
            <NavList
              items={items}
              unreadNotifications={unreadNotifications}
              connectedBrokers={connectedBrokers}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </ScrollArea>
          <UserFooter user={user} collapsed={false} />
        </SheetContent>
      </Sheet>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-3 h-11 border-b border-border bg-sidebar">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-sidebar-foreground/80 hover:text-sidebar-foreground">
          <Icons.Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Icons.Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-semibold font-mono tracking-tight">TRADE LINK</span>
        </div>
        <div className="w-4" />
      </div>
    </TooltipProvider>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TopBarProps {
  user: { email: string; name?: string; role: string } | null;
  unreadCount: number;
  recentNotifications: { id: string; title: string; body: string; severity: string; createdAt: string }[];
}

export function TopBar({ user, unreadCount, recentNotifications }: TopBarProps) {
  const setView = useNavStore((s) => s.setView);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      setView("discover");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-card/80 backdrop-blur px-4 md:px-6">
      <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search providers, instruments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-background/50 h-8 text-xs"
        />
      </form>

      <div className="flex items-center gap-1.5 ml-auto">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          onClick={() => (user ? setNotifOpen(true) : setAuthOpen(true))}
          aria-label="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-3.5 px-1 text-[9px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>

        <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-primary rm-pulse-dot" style={{ background: "var(--primary)" }} />
          <span className="text-muted-foreground">Online</span>
        </span>

        {user ? (
          <Button variant="ghost" size="sm" className="h-8 px-2 font-mono text-[11px]" onClick={() => setView("settings")}>
            {(user.name ?? user.email)[0].toUpperCase()}
          </Button>
        ) : (
          <Button size="sm" className="h-8" onClick={() => setAuthOpen(true)}>
            Sign in
          </Button>
        )}
      </div>

      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent side="right" className="w-80 p-0">
          <SheetHeader className="border-b border-border p-3">
            <SheetTitle className="flex items-center justify-between text-sm font-mono uppercase tracking-wider">
              <span>Alerts</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[9px]">{unreadCount} unread</Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)]">
            {recentNotifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground font-mono uppercase tracking-wider">
                No alerts yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentNotifications.map((n) => (
                  <div key={n.id} className="p-3 hover:bg-accent/30">
                    <div className="flex items-start gap-2">
                      <span className={`h-2 w-2 mt-1.5 rounded-full shrink-0 ${
                        n.severity === "error" ? "bg-loss" : n.severity === "warning" ? "bg-warning" : n.severity === "success" ? "bg-profit" : "bg-info"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{n.title}</div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>
                        <div className="text-[9px] text-muted-foreground mt-1 font-mono uppercase tracking-wider">{new Date(n.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          {user && (
            <div className="border-t border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full font-mono uppercase tracking-wider text-[10px]"
                onClick={() => {
                  setNotifOpen(false);
                  setView("notifications");
                }}
              >
                View all alerts
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </header>
  );
}

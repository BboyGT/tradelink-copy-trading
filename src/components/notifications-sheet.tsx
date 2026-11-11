"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: { id: string; title: string; body: string; severity: string; createdAt: string }[];
  unreadCount: number;
  onViewAll: () => void;
}

export function NotificationsSheet({ open, onOpenChange, notifications, unreadCount, onViewAll }: NotificationsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground font-mono uppercase tracking-wider">
              No alerts yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
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
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full font-mono uppercase tracking-wider text-[10px]"
            onClick={onViewAll}
          >
            View all alerts
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

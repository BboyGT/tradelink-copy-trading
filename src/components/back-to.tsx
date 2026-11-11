"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavStore } from "@/lib/nav-store";
import type { AppView } from "@/lib/types";

interface BackToProps {
  view: AppView;
  label: string;
}

/**
 * Small back-navigation button for secondary views (Analytics, Compare, Backtest, History, Alerts)
 * that aren't in the primary sidebar. Shows where the user came from / where to go back to.
 */
export function BackTo({ view, label }: BackToProps) {
  const setView = useNavStore((s) => s.setView);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 font-mono uppercase tracking-wider text-[10px] text-muted-foreground hover:text-primary"
      onClick={() => setView(view)}
    >
      <ArrowLeft className="h-3 w-3 mr-1" />
      {label}
    </Button>
  );
}

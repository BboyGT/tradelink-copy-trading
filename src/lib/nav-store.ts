"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppView } from "@/lib/types";
import { viewToPath } from "@/lib/view-routes";

interface NavState {
  view: AppView;
  selectedProviderId: string | null;
  selectedBrokerAccountId: string | null;
  authOpen: boolean;
  sidebarCollapsed: boolean;
  setView: (v: AppView) => void;
  syncViewFromUrl: (v: AppView) => void;
  selectProvider: (id: string | null) => void;
  selectBrokerAccount: (id: string | null) => void;
  setAuthOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      view: "dashboard",
      selectedProviderId: null,
      selectedBrokerAccountId: null,
      authOpen: false,
      sidebarCollapsed: false,
      setView: (v) => {
        set({ view: v });
        if (typeof window !== "undefined" && window.location.pathname !== viewToPath(v)) {
          window.history.pushState({}, "", `${viewToPath(v)}${window.location.search}`);
        }
      },
      syncViewFromUrl: (v) => set({ view: v }),
      selectProvider: (id) => {
        set({ selectedProviderId: id, view: "analytics" });
        if (typeof window !== "undefined" && window.location.pathname !== viewToPath("analytics")) {
          window.history.pushState({}, "", `${viewToPath("analytics")}${window.location.search}`);
        }
      },
      selectBrokerAccount: (id) => set({ selectedBrokerAccountId: id }),
      setAuthOpen: (open) => set({ authOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: "tradelink-nav",
      partialize: (s) => ({
        view: s.view,
        selectedProviderId: s.selectedProviderId,
        selectedBrokerAccountId: s.selectedBrokerAccountId,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    },
  ),
);

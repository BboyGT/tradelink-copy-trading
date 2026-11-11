"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface ScanEvent {
  type: "open" | "close" | "partial_close" | "modify";
  externalPositionId: string;
  instrument: string;
  direction: "BUY" | "SELL";
  volume: number;
  entryPrice: number;
  brokerAccountId: string;
  brokerCode: string;
  detectedAt: string;
  detectionLatencyMs: number;
}

export interface ScanResult {
  events: ScanEvent[];
  mirrored: number;
  errors: number;
  summary: {
    accountsScanned: number;
    totalEvents: number;
    opens: number;
    closes: number;
    partialCloses: number;
    modifications: number;
  };
}

/**
 * Hook that periodically scans the user's broker accounts for position changes.
 * When changes are detected, they're added to the events list and the Live Monitor
 * displays them alongside the WebSocket demo events.
 *
 * This implements the "copied account monitoring" approach from Part 2.1 of the PRD:
 * instead of subscribing to a provider's trade feed, we monitor the user's own
 * copy trading account and detect when positions change (because the provider
 * they're following traded).
 *
 * @param userId - the current user's ID (null if not signed in)
 * @param interval - scan interval in ms (default 5000 = 5 seconds)
 */
export function useAccountScanner(userId: string | null | undefined, interval = 5000) {
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [totalMirrored, setTotalMirrored] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [accountsScanned, setAccountsScanned] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scan = useCallback(async () => {
    if (!userId || scanning) return;
    setScanning(true);
    try {
      const res = await fetch("/api/monitoring/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const data: ScanResult = await res.json();

      if (data.events.length > 0) {
        setEvents(prev => [...data.events.reverse(), ...prev].slice(0, 100));
      }
      setTotalMirrored(prev => prev + data.mirrored);
      setTotalErrors(prev => prev + data.errors);
      setAccountsScanned(data.summary.accountsScanned);
      setLastScanAt(new Date());
    } catch (e) {
      // Silent fail — scanning is a background process
    } finally {
      setScanning(false);
    }
  }, [userId, scanning]);

  useEffect(() => {
    if (!userId) return;

    // Initial scan
    scan();

    // Set up periodic scanning
    intervalRef.current = setInterval(scan, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, interval, scan]);

  return {
    events,
    scanning,
    lastScanAt,
    totalMirrored,
    totalErrors,
    accountsScanned,
    scan, // manual trigger
  };
}

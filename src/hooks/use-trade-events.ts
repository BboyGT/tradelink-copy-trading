"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface TradeEvent {
  eventId: string;
  providerId: string;
  providerName: string;
  type: "open" | "modify" | "close" | "partial_close";
  instrument: string;
  direction: "BUY" | "SELL";
  volume: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  timestamp: string;
  detectionLatencyMs: number;
}

export function useTradeEvents(userId: string | null | undefined, _liveMode?: boolean, providerIds?: string[]) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let socket: Socket | null = null;
    setConnected(false);

    fetch("/api/events/socket-token", { method: "POST" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.token) throw new Error("Event authorization failed");
        if (!active) return;
        socket = io("/?XTransformPort=3003", {
          transports: ["websocket"],
          auth: { token: data.token },
        });
        socketRef.current = socket;
        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
        socket.on("trade_event", (event: TradeEvent) => {
          if (providerIds?.length && !providerIds.includes(event.providerId)) return;
          setEvents((prev) => [event, ...prev].slice(0, 100));
        });
      })
      .catch(() => setConnected(false));

    return () => {
      active = false;
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [userId, providerIds?.join(",")]);

  return { connected, events };
}

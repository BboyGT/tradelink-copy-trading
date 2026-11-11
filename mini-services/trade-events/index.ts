// Authenticated Socket.IO delivery for real account-monitoring events.
// The former random demo generator was removed: only the trusted server-side
// worker can publish and each socket is bound to its signed-in user's room.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Server } from "socket.io";
import { verifyEventToken } from "../../src/lib/event-token";

const PORT = Number(process.env.PORT ?? 3003);
const serviceToken = process.env.EVENTS_SERVICE_TOKEN;
const allowedOrigins = (process.env.WEB_ORIGINS ?? process.env.NEXTAUTH_URL ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);

const httpServer = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/internal/publish") {
    res.writeHead(404).end();
    return;
  }
  if (!serviceToken) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Event publishing is not configured" }));
    return;
  }

  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = Buffer.from(serviceToken);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    res.writeHead(401).end();
    return;
  }

  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk.toString();
      if (raw.length > 64_000) throw new Error("Request body too large");
    }
    const body = JSON.parse(raw) as { userId?: unknown; event?: Record<string, unknown> };
    const event = body.event;
    const validType = ["open", "modify", "close", "partial_close"].includes(String(event?.type));
    if (typeof body.userId !== "string" || body.userId.length < 1 || !event ||
        typeof event.eventId !== "string" || typeof event.instrument !== "string" || !validType) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid trade event" }));
      return;
    }
    io.to(`user:${body.userId}`).emit("trade_event", event);
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ accepted: true }));
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid publish request" }));
  }
});

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : false,
    methods: ["GET", "POST"],
  },
  path: "/",
});

io.use((socket, next) => {
  const userId = verifyEventToken(socket.handshake.auth?.token);
  if (!userId) return next(new Error("Unauthorized"));
  socket.data.userId = userId;
  next();
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);
  socket.emit("subscribed", { monitoringMode: "provider_events" });
});

httpServer.listen(PORT, () => {
  console.log(`[TRADE LINK] Authenticated event service listening on port ${PORT}`);
});

process.on("SIGTERM", () => {
  io.close();
  httpServer.close();
});
process.on("SIGINT", () => {
  io.close();
  httpServer.close();
});

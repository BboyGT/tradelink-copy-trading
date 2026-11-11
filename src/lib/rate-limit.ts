import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { isConfiguredSecret } from "@/lib/secret-utils";

const DEV_SECRET = "tradelink-development-secret-only-change-before-deploy-2026";
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupState = globalThis as typeof globalThis & { _tradeLinkRateLimitCleanupAt?: number };

function rateLimitKey(scope: string, subject: string) {
  const secret = process.env.NEXTAUTH_SECRET ?? (process.env.NODE_ENV === "production" ? "" : DEV_SECRET);
  if (!isConfiguredSecret(secret)) throw new Error("NEXTAUTH_SECRET must be a unique random secret of at least 32 characters");
  return createHmac("sha256", secret).update(`${scope}\0${subject}`).digest("hex");
}

/** Consume one durable fixed-window quota unit. Upsert + atomic increment keeps
 * the counter consistent across concurrent requests and app instances. */
export async function consumeRateLimit(scope: string, subject: string, windowMs: number, limit: number) {
  if (!scope || !subject || !Number.isFinite(windowMs) || windowMs < 1000 || !Number.isInteger(limit) || limit < 1) {
    throw new Error("Invalid rate-limit configuration");
  }
  const now = Date.now();
  const windowId = String(Math.floor(now / windowMs));
  const nextWindow = (Number(windowId) + 1) * windowMs;
  const row = await db.authRateLimitBucket.upsert({
    where: { key_window: { key: rateLimitKey(scope, subject.slice(0, 512)), window: windowId } },
    create: { key: rateLimitKey(scope, subject.slice(0, 512)), window: windowId, count: 1, expiresAt: new Date(nextWindow + windowMs) },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  if (now - (cleanupState._tradeLinkRateLimitCleanupAt ?? 0) >= CLEANUP_INTERVAL_MS) {
    cleanupState._tradeLinkRateLimitCleanupAt = now;
    void db.authRateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch((error) => {
      console.error("[security] authentication rate-limit cleanup failed", error instanceof Error ? error.message : "unknown error");
    });
  }

  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterSeconds: Math.max(1, Math.ceil((nextWindow - now) / 1000)),
  };
}

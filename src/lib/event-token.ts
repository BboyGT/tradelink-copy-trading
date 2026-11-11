import { createHmac, timingSafeEqual } from "crypto";
import { isConfiguredSecret } from "@/lib/secret-utils";

type EventToken = { sub: string; exp: number; scope: "events:read" };

function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!isConfiguredSecret(value)) throw new Error("NEXTAUTH_SECRET must be a unique random secret of at least 32 characters");
  return value;
}

export function createEventToken(userId: string) {
  const payload: EventToken = { sub: userId, exp: Math.floor(Date.now() / 1000) + 300, scope: "events:read" };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyEventToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra !== undefined) return null;
  try {
    const expected = createHmac("sha256", secret()).update(encoded).digest();
    const actual = Buffer.from(supplied, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as EventToken;
    if (payload.scope !== "events:read" || typeof payload.sub !== "string" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

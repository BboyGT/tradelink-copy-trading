import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function getSigningKey(): string {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key || key.length < 32) {
    throw new Error("NEXTAUTH_SECRET must contain at least 32 characters to use broker OAuth");
  }
  return key;
}

export function createDerivOAuthState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({
    userId,
    issuedAt: Date.now(),
    nonce: randomBytes(24).toString("base64url"),
  })).toString("base64url");
  const signature = createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyDerivOAuthState(state: string): string | null {
  const [payload, suppliedSignature, extra] = state.split(".");
  if (!payload || !suppliedSignature || extra !== undefined) return null;

  let expected: Buffer;
  try {
    expected = createHmac("sha256", getSigningKey()).update(payload).digest();
  } catch {
    return null;
  }

  let actual: Buffer;
  try {
    actual = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown;
      issuedAt?: unknown;
      nonce?: unknown;
    };
    const age = Date.now() - Number(value.issuedAt);
    if (typeof value.userId !== "string" || !value.userId || typeof value.nonce !== "string" || !value.nonce) return null;
    if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return null;
    return value.userId;
  } catch {
    return null;
  }
}

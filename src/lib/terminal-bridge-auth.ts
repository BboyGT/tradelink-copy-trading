import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function createBridgeSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashBridgeSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function bridgeSecretMatches(secret: string, expectedHash: string) {
  const actual = Buffer.from(hashBridgeSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function readBearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

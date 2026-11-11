// Simple, dependency-free password hashing for dev environment.
// In production, swap to argon2 or bcrypt (server-side only).
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function compare(password: string, stored: string): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, "hex");
  if (test.length !== storedBuf.length) return false;
  return timingSafeEqual(test, storedBuf);
}

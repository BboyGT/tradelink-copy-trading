// Simple, dependency-free password hashing for dev environment.
// In production, swap to argon2 or bcrypt (server-side only).
import { randomBytes, scrypt, timingSafeEqual } from "crypto";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, result) => error ? reject(error) : resolve(result));
  });
}

export async function hash(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("Password must be between 12 and 128 characters");
  const salt = randomBytes(16).toString("hex");
  const derived = await derive(password, salt);
  return `${salt}:${derived.toString("hex")}`;
}

export async function compare(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || password.length > 128 || typeof stored !== "string") return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || !/^[0-9a-f]{32}$/i.test(salt) || !/^[0-9a-f]{128}$/i.test(hash)) return false;
  const test = await derive(password, salt);
  const storedBuf = Buffer.from(hash, "hex");
  if (test.length !== storedBuf.length) return false;
  return timingSafeEqual(test, storedBuf);
}

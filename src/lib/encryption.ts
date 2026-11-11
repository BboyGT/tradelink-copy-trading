// TRADE LINK — Credential Encryption
//
// Broker access tokens and API credentials MUST be encrypted before storage.
// This module uses AES-256-GCM (authenticated encryption) with a server-side key.
//
// The encryption key is read from the ENCRYPTION_KEY environment variable.
// If not set, one is generated for the dev session (NOT secure for production).

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { isConfiguredSecret } from "@/lib/secret-utils";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (isConfiguredSecret(envKey) && envKey !== process.env.NEXTAUTH_SECRET) {
    // Derive a 32-byte key from the environment variable using scrypt
    const salt = Buffer.from("tradelink-static-salt-v1", "utf8");
    return scryptSync(envKey, salt, KEY_LENGTH);
  }
  if (process.env.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY must be a unique random secret of at least 32 characters in production");
  if (envKey) console.warn("[security] ENCRYPTION_KEY is missing, too short, a template value, or duplicates NEXTAUTH_SECRET; using a temporary dev key.");
  // Dev fallback — NOT secure for production. Generates a random key per process.
  // This means encrypted data becomes unreadable after a server restart in dev.
  if (!globalThis._tradelinkDevKey) {
    globalThis._tradelinkDevKey = randomBytes(KEY_LENGTH);
    console.warn("[security] ENCRYPTION_KEY not set — using temporary dev key. Encrypted data will be lost on restart.");
  }
  return globalThis._tradelinkDevKey as Buffer;
}

/**
 * Encrypt a credential (e.g. Deriv access token, broker password).
 * Returns a string that can be stored in the database safely.
 * Format: base64(iv + encrypted + authTag)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine iv + encrypted + authTag into a single buffer
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Decrypt a credential that was encrypted with encrypt().
 * Returns the original plaintext string.
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Generate a strong random secret (for NEXTAUTH_SECRET, ENCRYPTION_KEY, etc.)
 */
export function generateSecret(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

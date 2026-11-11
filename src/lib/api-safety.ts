const SENSITIVE_KEYS = new Set([
  "authref", "passwordhash", "password", "token", "accesstoken", "refreshtoken",
  "apikey", "clientsecret", "secret", "credentials",
]);

/** Remove stored credentials and password hashes before returning ORM data. */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    result[key] = redactSecrets(item);
  }
  return result as T;
}

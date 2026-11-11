const EXAMPLE_SECRET_PREFIX = /^(replace[-_ ]with|change[-_ ]me|your[-_ ]|placeholder)/i;

export function isConfiguredSecret(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && !EXAMPLE_SECRET_PREFIX.test(value.trim());
}

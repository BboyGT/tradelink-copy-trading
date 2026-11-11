import { timingSafeEqual } from "crypto";

export function hasServiceBearer(request: Request, secretName: "SCANNER_WORKER_TOKEN" | "EVENTS_SERVICE_TOKEN") {
  const expectedValue = process.env[secretName];
  const suppliedValue = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expectedValue || expectedValue.length < 32) return false;
  const expected = Buffer.from(expectedValue);
  const supplied = Buffer.from(suppliedValue);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

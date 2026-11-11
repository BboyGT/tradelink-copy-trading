import { NextRequest } from "next/server";
import { handleProviderCallback } from "@/lib/provider-oauth";

// The previous callback used Deriv's legacy authorization exchange and created
// an account row without verifying it through the current account API. Keep the
// callback fail-closed until the modern PKCE + account discovery flow is ready.
export async function GET(req: NextRequest) {
  return handleProviderCallback(req, "deriv");
}

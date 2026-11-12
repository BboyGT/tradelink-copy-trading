// Deriv OAuth - generate the authorization URL
// The browser redirects the user here, Deriv asks for consent, then redirects back
import { NextRequest } from "next/server";
import { createAuthorizationUrl } from "@/lib/provider-oauth";

export async function GET(req: NextRequest) {
  try {
    return await createAuthorizationUrl(req, "deriv");
  } catch (e: any) {
    const { NextResponse } = await import("next/server");
    const status = e.message === "UNAUTHORIZED" ? 401 : /not configured|must match|requires/.test(e.message) ? 503 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}

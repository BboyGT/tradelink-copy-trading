import { NextResponse, type NextRequest } from "next/server";
import { createAuthorizationUrl, type OAuthProvider } from "@/lib/provider-oauth";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: provider } = await context.params;
    if (!["deriv", "ctrader", "fxcm"].includes(provider)) return NextResponse.json({ error: "Unsupported provider." }, { status: 404 });
    return await createAuthorizationUrl(request, provider as OAuthProvider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : /not configured|must match|requires/.test(message) ? 503 : 500 });
  }
}

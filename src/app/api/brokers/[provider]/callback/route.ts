import { NextRequest, NextResponse } from "next/server";
import { handleProviderCallback, type OAuthProvider } from "@/lib/provider-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!["ctrader", "fxcm"].includes(provider)) {
    return NextResponse.redirect(new URL("/broker-connections?oauth_error=Unsupported%20provider", request.nextUrl.origin));
  }
  return handleProviderCallback(request, provider as OAuthProvider);
}

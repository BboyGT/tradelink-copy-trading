import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const platform = request.nextUrl.searchParams.get("platform");
    if (platform !== "mt4" && platform !== "mt5") return NextResponse.json({ error: "Choose mt4 or mt5" }, { status: 400 });
    const filename = platform === "mt4" ? "TradeLinkBridge.mq4" : "TradeLinkBridge.mq5";
    const filePath = join(process.cwd(), "bridges", platform, filename);
    const source = await readFile(filePath, "utf8");
    return new NextResponse(source, { headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 500 });
  }
}

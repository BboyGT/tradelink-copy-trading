// Trade history with reconciliation (Part 16)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const url = req.nextUrl;
    const limit = parseInt(url.searchParams.get("limit") ?? "100");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const status = url.searchParams.get("status");
    const providerId = url.searchParams.get("providerId");
    const brokerAccountId = url.searchParams.get("brokerAccountId");

    const where: any = { brokerAccount: { userId: user.id } };
    if (status) where.state = status;
    if (brokerAccountId) where.brokerAccountId = brokerAccountId;
    if (providerId) where.sourcePosition = { replicationConfig: { providerId } };

    const [positions, total] = await Promise.all([
      db.destinationPosition.findMany({
        where,
        include: {
          brokerAccount: { select: { accountLabel: true, brokerCode: true, currency: true } },
          sourcePosition: {
            include: {
              replicationConfig: {
                include: { provider: { select: { name: true, externalId: true } } },
              },
            },
          },
        },
        orderBy: { openTime: "desc" },
        take: limit,
        skip: offset,
      }),
      db.destinationPosition.count({ where }),
    ]);

    // Compute reconciliation status (Part 16.1)
    const reconciliation = positions.map((p) => {
      const issues: string[] = [];
      if (p.state === "open" && p.sourcePosition?.state === "closed") {
        issues.push("Source closed but destination still open");
      }
      if (p.state === "rejected" && p.sourcePosition?.state === "open") {
        issues.push("Source open but destination rejected");
      }
      if (p.state === "open" && !p.sourcePosition) {
        issues.push("Orphaned destination position (no source mapping)");
      }
      return { positionId: p.id, issues, healthy: issues.length === 0 };
    });

    return NextResponse.json({
      positions,
      reconciliation,
      total,
      offset,
      limit,
    });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

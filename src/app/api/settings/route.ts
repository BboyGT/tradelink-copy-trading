// User settings (Part 18, 22) — notification channels + trading defaults.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";

// Default UserSettings row — mirrors the Prisma column defaults so callers
// can rely on consistent shapes before the row exists.
const DEFAULT_SETTINGS = {
  notifInApp: true,
  notifPush: false,
  notifEmail: true,
  notifTelegram: false,
  reportingCurrency: "USD",
  defaultSizingMode: "equity_ratio",
  defaultExecutionMode: "approval",
  defaultRiskReferenceBase: "equity",
  telegramChatId: null as string | null,
};

// GET — return the user's UserSettings, creating defaults if not present.
export async function GET() {
  try {
    const user = await requireUser();
    const settings = await db.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    return NextResponse.json({ settings });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT — update the user's UserSettings (notification channels + trading defaults).
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const {
      notifInApp,
      notifPush,
      notifEmail,
      notifTelegram,
      reportingCurrency,
      defaultSizingMode,
      defaultExecutionMode,
      defaultRiskReferenceBase,
      telegramChatId,
    } = body as {
      notifInApp?: boolean;
      notifPush?: boolean;
      notifEmail?: boolean;
      notifTelegram?: boolean;
      reportingCurrency?: string;
      defaultSizingMode?: string;
      defaultExecutionMode?: string;
      defaultRiskReferenceBase?: string;
      telegramChatId?: string | null;
    };

    // Whitelist only the fields the caller actually provided.
    const data: Record<string, unknown> = {};
    if (typeof notifInApp === "boolean") data.notifInApp = notifInApp;
    if (typeof notifPush === "boolean") data.notifPush = notifPush;
    if (typeof notifEmail === "boolean") data.notifEmail = notifEmail;
    if (typeof notifTelegram === "boolean") data.notifTelegram = notifTelegram;
    if (typeof reportingCurrency === "string" && reportingCurrency.trim()) data.reportingCurrency = reportingCurrency.trim().toUpperCase();
    if (typeof defaultSizingMode === "string") data.defaultSizingMode = defaultSizingMode;
    if (typeof defaultExecutionMode === "string") data.defaultExecutionMode = defaultExecutionMode;
    if (typeof defaultRiskReferenceBase === "string") data.defaultRiskReferenceBase = defaultRiskReferenceBase;
    if (telegramChatId === null || typeof telegramChatId === "string") data.telegramChatId = telegramChatId;

    const settings = await db.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...DEFAULT_SETTINGS,
        ...data,
      },
      update: data,
    });

    await audit({
      userId: user.id,
      action: "settings.update",
      result: "success",
      details: { updatedFields: Object.keys(data) },
    });

    return NextResponse.json({ settings });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

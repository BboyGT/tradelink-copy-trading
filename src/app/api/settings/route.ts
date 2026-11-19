// User settings (Part 18, 22) - notification channels + trading defaults.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";

// Default UserSettings row - mirrors the Prisma column defaults so callers
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

// GET - return the user's UserSettings, creating defaults if not present.
export async function GET() {
  try {
    const user = await requireUser();
    const [settings, profile] = await Promise.all([
      db.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      db.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, createdAt: true, passwordHash: true } }),
    ]);
    return NextResponse.json({
      settings,
      profile: profile ? { name: profile.name, email: profile.email, createdAt: profile.createdAt, hasPassword: Boolean(profile.passwordHash) } : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT - update the user's UserSettings (notification channels + trading defaults).
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
      name,
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
      name?: string;
    };

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length > 80) {
        return NextResponse.json({ error: "Name must be 80 characters or fewer." }, { status: 400 });
      }
    }

    const validCurrencies = ["USD", "EUR", "GBP", "JPY"];
    const validSizingModes = ["equity_ratio", "fixed_multiplier", "fixed_lot", "risk_based"];
    const validExecutionModes = ["approval", "auto", "notify_only"];
    const validRiskBases = ["balance", "equity", "fixed_capital"];
    if (reportingCurrency !== undefined && (typeof reportingCurrency !== "string" || !validCurrencies.includes(reportingCurrency.trim().toUpperCase()))) {
      return NextResponse.json({ error: "Choose a supported reporting currency." }, { status: 400 });
    }
    if (defaultSizingMode !== undefined && (typeof defaultSizingMode !== "string" || !validSizingModes.includes(defaultSizingMode))) {
      return NextResponse.json({ error: "Choose a supported default sizing mode." }, { status: 400 });
    }
    if (defaultExecutionMode !== undefined && (typeof defaultExecutionMode !== "string" || !validExecutionModes.includes(defaultExecutionMode))) {
      return NextResponse.json({ error: "Choose a supported default execution mode." }, { status: 400 });
    }
    if (defaultRiskReferenceBase !== undefined && (typeof defaultRiskReferenceBase !== "string" || !validRiskBases.includes(defaultRiskReferenceBase))) {
      return NextResponse.json({ error: "Choose a supported risk reference base." }, { status: 400 });
    }
    if (typeof telegramChatId === "string" && telegramChatId.trim().length > 128) {
      return NextResponse.json({ error: "Telegram chat ID must be 128 characters or fewer." }, { status: 400 });
    }
    if (name !== undefined) await db.user.update({ where: { id: user.id }, data: { name: name.trim() || null } });

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
    if (telegramChatId === null || typeof telegramChatId === "string") data.telegramChatId = telegramChatId?.trim() || null;

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
      details: { updatedFields: [...Object.keys(data), ...(name !== undefined ? ["name"] : [])] },
    });

    return NextResponse.json({ settings, ...(name !== undefined ? { profile: { name: name.trim() || null } } : {}) });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

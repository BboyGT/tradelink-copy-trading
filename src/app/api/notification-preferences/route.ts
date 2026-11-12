// Notification preferences (Part 15, 22) - per-scope channel overrides.
//
// NotificationPreferences lets users override their global UserSettings channels
// (in-app / push / email / telegram) on a per-provider or per-account basis,
// plus severity thresholds and quiet hours.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";

const VALID_SCOPES = ["provider", "account"] as const;
type PrefScope = (typeof VALID_SCOPES)[number];

const VALID_SEVERITIES = ["info", "success", "warning", "error"] as const;
type Severity = (typeof VALID_SEVERITIES)[number];

function isValidScope(s: unknown): s is PrefScope {
  return typeof s === "string" && (VALID_SCOPES as readonly string[]).includes(s);
}

function normalizeSeverity(s: unknown): Severity {
  if (typeof s === "string" && (VALID_SEVERITIES as readonly string[]).includes(s)) return s as Severity;
  return "info";
}

// Returns the validated quiet-hour value (0..23) or null when input is null.
// Returns `undefined` (the literal) when input is invalid - callers should skip.
function parseQuietHour(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const n = Math.trunc(v);
  if (n < 0 || n > 23) return undefined;
  return n;
}

// GET - list all preferences for the user.
// Optional `?scope=provider|account` filter.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope");

    const where: { userId: string; scope?: PrefScope } = { userId: user.id };
    if (scope) {
      if (!isValidScope(scope)) {
        return NextResponse.json({ error: "scope must be 'provider' or 'account'" }, { status: 400 });
      }
      where.scope = scope;
    }

    const preferences = await db.notificationPreferences.findMany({
      where,
      orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ preferences });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST - create or update a NotificationPreferences record (upsert by userId+scope+scopeRefId).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const {
      scope,
      scopeRefId,
      inApp,
      push,
      email,
      telegram,
      minSeverity,
      quietHoursStart,
      quietHoursEnd,
    } = body as {
      scope?: string;
      scopeRefId?: string;
      inApp?: boolean;
      push?: boolean;
      email?: boolean;
      telegram?: boolean;
      minSeverity?: string;
      quietHoursStart?: number | null;
      quietHoursEnd?: number | null;
    };

    if (!isValidScope(scope)) {
      return NextResponse.json({ error: "scope must be 'provider' or 'account'" }, { status: 400 });
    }
    if (!scopeRefId || typeof scopeRefId !== "string") {
      return NextResponse.json({ error: "scopeRefId is required" }, { status: 400 });
    }

    // Build update payload with only the fields actually supplied.
    const data: Record<string, unknown> = {};
    if (typeof inApp === "boolean") data.inApp = inApp;
    if (typeof push === "boolean") data.push = push;
    if (typeof email === "boolean") data.email = email;
    if (typeof telegram === "boolean") data.telegram = telegram;
    if (typeof minSeverity === "string") data.minSeverity = normalizeSeverity(minSeverity);
    // Quiet hours: null clears the value, valid 0..23 sets it, invalid is ignored.
    if (quietHoursStart === null) {
      data.quietHoursStart = null;
    } else if (typeof quietHoursStart === "number") {
      const n = parseQuietHour(quietHoursStart);
      if (n !== undefined) data.quietHoursStart = n;
    }
    if (quietHoursEnd === null) {
      data.quietHoursEnd = null;
    } else if (typeof quietHoursEnd === "number") {
      const n = parseQuietHour(quietHoursEnd);
      if (n !== undefined) data.quietHoursEnd = n;
    }

    const preference = await db.notificationPreferences.upsert({
      where: {
        userId_scope_scopeRefId: {
          userId: user.id,
          scope,
          scopeRefId,
        },
      },
      create: {
        userId: user.id,
        scope,
        scopeRefId,
        inApp: typeof inApp === "boolean" ? inApp : true,
        push: typeof push === "boolean" ? push : false,
        email: typeof email === "boolean" ? email : true,
        telegram: typeof telegram === "boolean" ? telegram : false,
        minSeverity: normalizeSeverity(minSeverity),
        quietHoursStart: typeof quietHoursStart === "number" ? parseQuietHour(quietHoursStart) ?? null : null,
        quietHoursEnd: typeof quietHoursEnd === "number" ? parseQuietHour(quietHoursEnd) ?? null : null,
      },
      update: data,
    });

    await audit({
      userId: user.id,
      action: "notification_preferences.upsert",
      result: "success",
      details: { scope, scopeRefId, updatedFields: Object.keys(data) },
    });

    return NextResponse.json({ preference });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE - delete a NotificationPreferences record by id.
// Accepts the id either via query param (?id=...) or request body { id }.
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();

    let id: string | undefined;
    const { searchParams } = new URL(req.url);
    id = searchParams.get("id") ?? undefined;

    if (!id) {
      // Allow callers that prefer a DELETE-with-body pattern.
      try {
        const body = await req.json();
        if (body && typeof body.id === "string") id = body.id;
      } catch {
        // No body - that's fine, id stays undefined.
      }
    }

    if (!id) {
      return NextResponse.json({ error: "id query parameter (or body.id) is required" }, { status: 400 });
    }

    // findFirst ensures tenant isolation: only the owner can delete their own preference.
    const existing = await db.notificationPreferences.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.notificationPreferences.delete({ where: { id } });

    await audit({
      userId: user.id,
      action: "notification_preferences.delete",
      result: "success",
      details: { id, scope: existing.scope, scopeRefId: existing.scopeRefId },
    });

    return NextResponse.json({ status: "deleted" });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

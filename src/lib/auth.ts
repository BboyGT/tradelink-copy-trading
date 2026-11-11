// TRADE LINK — Authentication & session management
// NextAuth (credentials provider) + helpers for tenant isolation.

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "@/lib/crypto";
import { db } from "@/lib/db";

function getAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("NEXTAUTH_SECRET must be configured with at least 32 characters in production");
  return "tradelink-development-secret-only-change-before-deploy-2026";
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/?view=auth",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.passwordHash || user.status !== "active") return null;
        const ok = await compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  secret: getAuthSecret(),
};

// Helper: get the current user's id from a server-side session.
// Throws if unauthenticated — protects API routes by default.
import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as { id: string; email: string; name?: string; role: string };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

// Audit logging helper — every sensitive action gets recorded.
export async function audit(args: {
  userId?: string;
  brokerAccountId?: string;
  replicationConfigId?: string;
  action: string;
  result: "success" | "failure" | "warning";
  details?: Record<string, any>;
}) {
  try {
    const ip = headers().get("x-forwarded-for") ?? undefined;
    await db.auditEvent.create({
      data: {
        userId: args.userId ?? null,
        brokerAccountId: args.brokerAccountId ?? null,
        replicationConfigId: args.replicationConfigId ?? null,
        action: args.action,
        result: args.result,
        ipAddress: ip,
        details: JSON.stringify(args.details ?? {}),
      },
    });
  } catch (e) {
    // Audit failure must not break user flow
    console.error("[audit] failed to record:", e);
  }
}

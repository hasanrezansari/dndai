import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq, gt, isNull } from "drizzle-orm";
import NextAuth from "next-auth";
import type { NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  authAccounts,
  authSessions,
  authBridgeTokens,
  authUsers,
  authVerificationTokens,
} from "@/lib/db/schema";
import { hashBridgeToken } from "@/lib/auth/bridge-tokens";

let _nextAuth: NextAuthResult | null = null;

function getNextAuth(): NextAuthResult {
  if (!_nextAuth) {
    const db = getDb();
    _nextAuth = NextAuth({
      adapter: DrizzleAdapter(db, {
        usersTable: authUsers,
        accountsTable: authAccounts,
        sessionsTable: authSessions,
        verificationTokensTable: authVerificationTokens,
      }),
      trustHost: true,
      secret: process.env.NEXTAUTH_SECRET,
      // OAuth cancel / deny sends users through /api/auth/signin. Send them to the app shell
      // instead of Auth.js’s default HTML page (avoids “blank” / confusing recovery).
      pages: {
        signIn: "/",
        error: "/",
      },
      session: {
        strategy: "jwt",
        maxAge: 60 * 60 * 24 * 30,
      },
      providers: [
        Credentials({
          id: "guest",
          name: "Guest",
          credentials: {
            displayName: { label: "Display Name", type: "text" },
            guestId: { label: "Guest ID", type: "text" },
          },
          async authorize(credentials) {
            const realDb = getDb();
            const guestId =
              typeof credentials?.guestId === "string"
                ? credentials.guestId.trim()
                : "";
            const displayName =
              (typeof credentials?.displayName === "string"
                ? credentials.displayName.trim()
                : "") || "Adventurer";
            if (!guestId || !z.string().uuid().safeParse(guestId).success) {
              return null;
            }
            const email = `guest-${guestId}@ashveil.guest`;
            const [existing] = await realDb
              .select()
              .from(authUsers)
              .where(eq(authUsers.id, guestId))
              .limit(1);
            if (existing) {
              if (displayName !== (existing.name ?? "")) {
                await realDb
                  .update(authUsers)
                  .set({ name: displayName })
                  .where(eq(authUsers.id, guestId));
              }
              return {
                id: existing.id,
                name: displayName,
                email: existing.email ?? email,
              };
            }
            await realDb.insert(authUsers).values({
              id: guestId,
              name: displayName,
              email,
              emailVerified: null,
              image: null,
            });
            return { id: guestId, name: displayName, email };
          },
        }),
        Credentials({
          id: "bridge",
          name: "Bridge",
          credentials: {
            token: { label: "Bridge Token", type: "text" },
          },
          async authorize(credentials) {
            const realDb = getDb();
            const token =
              typeof credentials?.token === "string"
                ? credentials.token.trim()
                : "";
            if (!token) return null;
            const tokenHash = hashBridgeToken(token);

            const now = new Date();
            const [row] = await realDb
              .update(authBridgeTokens)
              .set({ used_at: now })
              .where(
                and(
                  eq(authBridgeTokens.token_hash, tokenHash),
                  isNull(authBridgeTokens.used_at),
                  gt(authBridgeTokens.expires_at, now),
                ),
              )
              .returning({
                userId: authBridgeTokens.user_id,
              });

            if (!row) return null;

            const [user] = await realDb
              .select()
              .from(authUsers)
              .where(eq(authUsers.id, row.userId))
              .limit(1);
            if (!user) return null;
            return {
              id: user.id,
              name: user.name ?? "Adventurer",
              email: user.email ?? null,
            };
          },
        }),
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          allowDangerousEmailAccountLinking: false,
        }),
      ],
      callbacks: {
        session({ session, token }) {
          if (token.sub) session.user.id = token.sub;
          return session;
        },
        jwt({ token, user }) {
          if (user) token.sub = user.id;
          return token;
        },
      },
    });
  }
  return _nextAuth;
}

export const handlers = {
  GET: (...args: Parameters<NextAuthResult["handlers"]["GET"]>) =>
    getNextAuth().handlers.GET(...args),
  POST: (...args: Parameters<NextAuthResult["handlers"]["POST"]>) =>
    getNextAuth().handlers.POST(...args),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = ((...args: any[]) => (getNextAuth().auth as any)(...args)) as NextAuthResult["auth"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signIn = ((...args: any[]) => (getNextAuth().signIn as any)(...args)) as NextAuthResult["signIn"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signOut = ((...args: any[]) => (getNextAuth().signOut as any)(...args)) as NextAuthResult["signOut"];

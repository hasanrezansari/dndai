import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
} from "@/lib/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
  },
  providers: [
    Credentials({
      name: "Guest",
      credentials: {
        displayName: { label: "Display Name", type: "text" },
        guestId: { label: "Guest ID", type: "text" },
      },
      async authorize(credentials) {
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
        const [existing] = await db
          .select()
          .from(authUsers)
          .where(eq(authUsers.id, guestId))
          .limit(1);
        if (existing) {
          if (displayName !== (existing.name ?? "")) {
            await db
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
        await db.insert(authUsers).values({
          id: guestId,
          name: displayName,
          email,
          emailVerified: null,
          image: null,
        });
        return { id: guestId, name: displayName, email };
      },
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

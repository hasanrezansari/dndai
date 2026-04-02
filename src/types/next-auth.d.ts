import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: Omit<DefaultSession["user"], "email" | "name"> & {
      id: string;
      email?: string | null;
      name?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    email?: string | null;
    name?: string | null;
  }
}

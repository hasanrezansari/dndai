import { auth } from "./config";

export async function getCurrentUser(): Promise<{
  id: string;
  name: string;
  email: string | null;
} | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "Adventurer",
    email: session.user.email ?? null,
  };
}

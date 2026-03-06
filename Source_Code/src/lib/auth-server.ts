import { cookies } from "next/headers";
import { getUserBySessionToken } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
import type { AuthUser } from "@/types/auth";

export async function getCurrentUserFromCookies(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  return getUserBySessionToken(token);
}

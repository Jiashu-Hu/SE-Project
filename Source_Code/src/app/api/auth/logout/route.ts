import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;

  if (token) {
    deleteSession(token);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

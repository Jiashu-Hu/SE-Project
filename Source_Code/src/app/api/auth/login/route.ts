import { NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
import { validateEmail } from "@/lib/auth-validation";
import type { LoginPayload } from "@/types/auth";

function isLoginPayload(value: unknown): value is LoginPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { email?: unknown; password?: unknown };
  return typeof payload.email === "string" && typeof payload.password === "string";
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isLoginPayload(payload)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const emailCheck = validateEmail(payload.email ?? "");
  if (!emailCheck.valid) {
    return NextResponse.json({ error: emailCheck.error }, { status: 400 });
  }

  if (!payload.password || payload.password.length === 0) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  const user = authenticateUser(payload.email, payload.password);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const session = createSession(user.id);

  const response = NextResponse.json({ user });
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });

  return response;
}

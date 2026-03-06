import { NextResponse } from "next/server";
import { createSession, registerUser } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
import {
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/auth-validation";
import type { RegisterPayload } from "@/types/auth";

function isRegisterPayload(value: unknown): value is RegisterPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { name?: unknown; email?: unknown; password?: unknown };
  return (
    typeof payload.name === "string" &&
    typeof payload.email === "string" &&
    typeof payload.password === "string"
  );
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isRegisterPayload(payload)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const nameCheck = validateName(payload.name ?? "");
  if (!nameCheck.valid) {
    return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  }

  const emailCheck = validateEmail(payload.email ?? "");
  if (!emailCheck.valid) {
    return NextResponse.json({ error: emailCheck.error }, { status: 400 });
  }

  const passwordCheck = validatePassword(payload.password ?? "");
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
  }

  const result = registerUser({
    name: payload.name,
    email: payload.email,
    password: payload.password,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const session = createSession(result.user.id);

  const response = NextResponse.json({ user: result.user }, { status: 201 });
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

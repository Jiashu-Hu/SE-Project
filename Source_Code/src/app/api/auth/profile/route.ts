import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { updateUserProfile } from "@/lib/auth";
import { validateEmail, validateName } from "@/lib/auth-validation";
import type { UpdateProfilePayload } from "@/types/auth";

function isUpdateProfilePayload(value: unknown): value is UpdateProfilePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { name?: unknown; email?: unknown };
  return typeof payload.name === "string" && typeof payload.email === "string";
}

export async function PATCH(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isUpdateProfilePayload(payload)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const nameCheck = validateName(payload.name);
  if (!nameCheck.valid) {
    return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  }

  const emailCheck = validateEmail(payload.email);
  if (!emailCheck.valid) {
    return NextResponse.json({ error: emailCheck.error }, { status: 400 });
  }

  const result = await updateUserProfile({
    userId: user.id,
    name: payload.name,
    email: payload.email,
  });

  if ("error" in result) {
    const status = result.error.includes("already exists") ? 409 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ user: result.user });
}

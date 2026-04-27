import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { changeUserPassword } from "@/lib/auth";
import { validatePassword } from "@/lib/auth-validation";
import type { ChangePasswordPayload } from "@/types/auth";

function isChangePasswordPayload(value: unknown): value is ChangePasswordPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { currentPassword?: unknown; newPassword?: unknown };
  return (
    typeof payload.currentPassword === "string" &&
    typeof payload.newPassword === "string"
  );
}

export async function POST(request: Request) {
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

  if (!isChangePasswordPayload(payload)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (payload.currentPassword.length === 0) {
    return NextResponse.json(
      { error: "Current password is required." },
      { status: 400 }
    );
  }

  const passwordCheck = validatePassword(payload.newPassword);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
  }

  const result = changeUserPassword({
    userId: user.id,
    currentPassword: payload.currentPassword,
    newPassword: payload.newPassword,
  });

  if ("error" in result) {
    const status = result.error.includes("incorrect") ? 400 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}

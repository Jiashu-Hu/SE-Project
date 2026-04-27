import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/auth";
import { validatePassword } from "@/lib/auth-validation";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { token, newPassword } = body as Record<string, unknown>;

  if (typeof token !== "string" || token.trim().length === 0) {
    return NextResponse.json({ error: "Reset token is required." }, { status: 400 });
  }

  if (typeof newPassword !== "string") {
    return NextResponse.json({ error: "New password is required." }, { status: 400 });
  }

  const passwordCheck = validatePassword(newPassword);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
  }

  const result = resetPasswordWithToken(token.trim(), newPassword);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

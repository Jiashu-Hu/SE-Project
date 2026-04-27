import { NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/auth";
import { validateEmail } from "@/lib/auth-validation";

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

  const { email } = body as Record<string, unknown>;

  if (typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return NextResponse.json({ error: emailCheck.error }, { status: 400 });
  }

  const result = createPasswordResetToken(email);

  // Always respond with 200 to avoid leaking whether the email exists.
  // Return token only when one was actually generated (non-empty string).
  const token = "token" in result ? result.token : "";
  return NextResponse.json({ token: token || null });
}

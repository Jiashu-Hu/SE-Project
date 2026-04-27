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
  const token = "token" in result ? result.token : "";

  // Always respond with 200 and an identical shape regardless of whether the
  // email exists, to avoid leaking account enumeration.
  //
  // In a real deployment the token would be sent out-of-band via email. This
  // app has no email infrastructure, so for local development we expose the
  // token in the response under `devToken` to keep the demo flow workable.
  // The token is NEVER included when NODE_ENV is "production".
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction && token) {
    return NextResponse.json({ ok: true, devToken: token });
  }

  return NextResponse.json({ ok: true });
}

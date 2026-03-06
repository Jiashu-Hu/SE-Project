import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";

export async function GET() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}

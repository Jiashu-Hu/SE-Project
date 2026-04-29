import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { removeFromBucket } from "@/lib/bucket";

interface RouteContext {
  readonly params: Promise<{ recipeId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { recipeId } = await params;
  const ok = await removeFromBucket(user.id, recipeId);
  if (!ok) {
    return NextResponse.json({ error: "Not in bucket." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import {
  listBucket,
  addToBucket,
  clearBucket,
} from "@/lib/bucket";

export async function GET(_request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const items = await listBucket(user.id);
  return NextResponse.json({ items });
}

interface AddBody {
  readonly recipeId: string;
}

function isAddBody(value: unknown): value is AddBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.recipeId === "string";
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isAddBody(body)) {
    return NextResponse.json(
      { error: "Body must include recipeId (string)." },
      { status: 400 }
    );
  }

  const result = await addToBucket(user.id, body.recipeId);
  if ("error" in result) {
    if (result.error === "Already in bucket.") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ item: result.item }, { status: 201 });
}

export async function DELETE(_request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const cleared = await clearBucket(user.id);
  return NextResponse.json({ cleared });
}

import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { updateSlot, deleteSlot } from "@/lib/meal-plan";

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

interface PatchBody {
  readonly recipeId?: string;
  readonly servings?: number;
}

function isPatchBody(value: unknown): value is PatchBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.recipeId !== undefined && typeof v.recipeId !== "string") return false;
  if (v.servings !== undefined) {
    if (typeof v.servings !== "number") return false;
    if (!Number.isInteger(v.servings) || v.servings < 1) return false;
  }
  return v.recipeId !== undefined || v.servings !== undefined;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isPatchBody(body)) {
    return NextResponse.json(
      { error: "Body must include recipeId and/or servings (>= 1)." },
      { status: 400 }
    );
  }

  const updated = await updateSlot({
    slotId: id,
    userId: user.id,
    recipeId: body.recipeId,
    servings: body.servings,
  });
  if (!updated) {
    return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  }
  return NextResponse.json({ slot: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteSlot(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

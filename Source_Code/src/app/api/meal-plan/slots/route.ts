import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { createSlot, MEAL_TYPES, type MealType } from "@/lib/meal-plan";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CreateBody {
  readonly date: string;
  readonly mealType: MealType;
  readonly recipeId: string;
  readonly servings: number;
}

function isCreateBody(value: unknown): value is CreateBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === "string" &&
    ISO_DATE_RE.test(v.date) &&
    typeof v.mealType === "string" &&
    (MEAL_TYPES as readonly string[]).includes(v.mealType) &&
    typeof v.recipeId === "string" &&
    typeof v.servings === "number" &&
    Number.isInteger(v.servings) &&
    v.servings >= 1
  );
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

  if (!isCreateBody(body)) {
    return NextResponse.json(
      { error: "Body must include date (YYYY-MM-DD), mealType, recipeId, and servings >= 1." },
      { status: 400 }
    );
  }

  const result = await createSlot({
    userId: user.id,
    date: body.date,
    mealType: body.mealType,
    recipeId: body.recipeId,
    servings: body.servings,
  });
  if ("error" in result) {
    if (result.error === "This slot is already filled.") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ slot: result.slot }, { status: 201 });
}

import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { createRecipe } from "@/lib/recipes";
import { validateCreateRecipePayload } from "@/lib/recipe-validation";

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

  const result = validateCreateRecipePayload(body);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const recipe = createRecipe(user.id, result.payload);
  return NextResponse.json({ recipe }, { status: 201 });
}

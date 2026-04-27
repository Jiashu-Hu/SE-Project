import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { getRecipeById, updateRecipe, deleteRecipe } from "@/lib/recipes";
import { validateCreateRecipePayload } from "@/lib/recipe-validation";

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const recipe = await getRecipeById(id);

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  if (recipe.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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

  const updated = await updateRecipe(id, result.payload);
  if (!updated) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  return NextResponse.json({ recipe: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const recipe = await getRecipeById(id);

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  if (recipe.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await deleteRecipe(id);
  return new NextResponse(null, { status: 204 });
}

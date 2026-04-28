import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import {
  generateRecipeFromText,
  generateRecipeFromImage,
} from "@/lib/ai-recipe";

const MAX_TEXT_LEN = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB after compression upper bound

interface GenerateRequest {
  readonly mode: "text" | "image";
  readonly input: string;
}

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.mode === "text" || v.mode === "image") && typeof v.input === "string"
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
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!isGenerateRequest(body)) {
    return NextResponse.json(
      { error: "Body must be { mode: 'text' | 'image', input: string }." },
      { status: 400 }
    );
  }

  if (body.mode === "text") {
    if (body.input.trim().length === 0) {
      return NextResponse.json(
        { error: "Text input is required." },
        { status: 400 }
      );
    }
    if (body.input.length > MAX_TEXT_LEN) {
      return NextResponse.json(
        { error: `Text input must be ${MAX_TEXT_LEN} characters or fewer.` },
        { status: 400 }
      );
    }
  } else {
    if (body.input.length > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image too large; please use a smaller photo." },
        { status: 400 }
      );
    }
  }

  try {
    const recipe =
      body.mode === "text"
        ? await generateRecipeFromText(body.input)
        : await generateRecipeFromImage(body.input);
    return NextResponse.json({ recipe });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { bulkUpdateServings } from "@/lib/meal-plan";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface BulkBody {
  readonly weekStart: string;
  readonly servings: number;
}

function isBulkBody(value: unknown): value is BulkBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.weekStart === "string" &&
    ISO_DATE_RE.test(v.weekStart) &&
    typeof v.servings === "number" &&
    Number.isInteger(v.servings) &&
    v.servings >= 1
  );
}

export async function PATCH(request: Request) {
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
  if (!isBulkBody(body)) {
    return NextResponse.json(
      { error: "Body must include weekStart (YYYY-MM-DD) and servings (>= 1)." },
      { status: 400 }
    );
  }

  const updated = await bulkUpdateServings(user.id, body.weekStart, body.servings);
  return NextResponse.json({ updated });
}

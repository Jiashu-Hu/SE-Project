import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/recipes/generate/route";
import { registerUser, createSession } from "@/lib/auth";
import { __setTestClient, __resetClient } from "@/lib/ai-recipe";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

function makeFakeClient(responses: unknown[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const next = responses[i++];
          if (!next) throw new Error("fake client ran out of responses");
          return next;
        },
      },
    },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

function makeChatResponse(payload: unknown) {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 0,
    model: "gpt-4.1-mini",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify(payload), refusal: null },
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

const VALID_RECIPE = {
  title: "Smoke Eggs",
  description: "Eggs but smoky.",
  category: "Breakfast",
  prepTime: 2,
  cookTime: 5,
  servings: 1,
  ingredients: [{ amount: "2", unit: "", item: "eggs" }],
  instructions: ["Crack eggs", "Cook"],
  tags: [],
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function logIn(email: string): Promise<void> {
  const reg = await registerUser({
    name: "U",
    email,
    password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
}

beforeEach(() => cookieJar.clear());
afterEach(() => __resetClient());

describe("POST /api/recipes/generate", () => {
  it("returns 401 when not logged in", async () => {
    __setTestClient(makeFakeClient([])); // shouldn't reach lib
    const res = await POST(makeRequest({ mode: "text", input: "chicken" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing mode or input", async () => {
    await logIn("a@x.com");
    const res = await POST(makeRequest({ mode: "text" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid mode value", async () => {
    await logIn("b@x.com");
    const res = await POST(makeRequest({ mode: "audio", input: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for text input over 2000 characters", async () => {
    await logIn("c@x.com");
    const res = await POST(
      makeRequest({ mode: "text", input: "x".repeat(2001) })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an image data URL larger than 5 MB", async () => {
    await logIn("d@x.com");
    const giant = `data:image/jpeg;base64,${"A".repeat(7 * 1024 * 1024)}`;
    const res = await POST(makeRequest({ mode: "image", input: giant }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with a valid CreateRecipePayload for text input", async () => {
    await logIn("e@x.com");
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const res = await POST(makeRequest({ mode: "text", input: "eggs" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipe.title).toBe("Smoke Eggs");
    expect(body.recipe.tags).toContain("ai-generated");
  });

  it("returns 200 for image input", async () => {
    await logIn("f@x.com");
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const res = await POST(
      makeRequest({
        mode: "image",
        input: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipe.title).toBe("Smoke Eggs");
  });

  it("returns 502 when the AI lib hard-fails", async () => {
    await logIn("g@x.com");
    const invalid = { ...VALID_RECIPE, title: "" };
    __setTestClient(
      makeFakeClient([makeChatResponse(invalid), makeChatResponse(invalid)])
    );

    const res = await POST(makeRequest({ mode: "text", input: "eggs" }));
    expect(res.status).toBe(502);
  });
});

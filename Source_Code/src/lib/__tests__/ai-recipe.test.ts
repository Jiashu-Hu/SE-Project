import { describe, it, expect, afterEach } from "vitest";
import {
  generateRecipeFromText,
  generateRecipeFromImage,
  getOpenAI,
  __setTestClient,
  __resetClient,
} from "@/lib/ai-recipe";
import { registerUser } from "@/lib/auth";

async function newUserId(): Promise<string> {
  const reg = await registerUser({
    name: "AI",
    email: `ai-${Math.random()}@x.com`,
    password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  return reg.user.id;
}

// Minimal fake of the OpenAI SDK's `chat.completions.create` surface.
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
        message: {
          role: "assistant",
          content: JSON.stringify(payload),
          refusal: null,
        },
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

const VALID_RECIPE = {
  title: "Pasta Aglio e Olio",
  description: "Garlicky weeknight pasta.",
  category: "Dinner",
  prepTime: 5,
  cookTime: 15,
  servings: 2,
  ingredients: [
    { amount: "200", unit: "g", item: "spaghetti" },
    { amount: "4", unit: "cloves", item: "garlic" },
  ],
  instructions: ["Boil water", "Cook pasta", "Toss with garlic"],
  tags: ["italian", "quick"],
};

afterEach(() => __resetClient());

describe("generateRecipeFromText", () => {
  it("returns a validated payload from a successful structured-output response", async () => {
    const u = await newUserId();
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const recipe = await generateRecipeFromText(u, "chicken and rice");

    expect(recipe.title).toBe("Pasta Aglio e Olio");
    expect(recipe.servings).toBe(2);
    expect(recipe.ingredients).toHaveLength(2);
  });

  it("retries once when the first response fails validation", async () => {
    const u = await newUserId();
    const invalid = { ...VALID_RECIPE, title: "" }; // empty title fails validation
    __setTestClient(
      makeFakeClient([
        makeChatResponse(invalid),
        makeChatResponse(VALID_RECIPE),
      ])
    );

    const recipe = await generateRecipeFromText(u, "chicken");
    expect(recipe.title).toBe("Pasta Aglio e Olio");
  });

  it("throws when both attempts fail validation", async () => {
    const u = await newUserId();
    const invalid = { ...VALID_RECIPE, servings: 0 }; // servings must be >= 1
    __setTestClient(
      makeFakeClient([
        makeChatResponse(invalid),
        makeChatResponse(invalid),
      ])
    );

    await expect(generateRecipeFromText(u, "chicken")).rejects.toThrow(
      /AI generation failed/
    );
  });

  it("ensures every result has the ai-generated tag", async () => {
    const u = await newUserId();
    const noTag = { ...VALID_RECIPE, tags: ["italian"] };
    __setTestClient(makeFakeClient([makeChatResponse(noTag)]));

    const recipe = await generateRecipeFromText(u, "chicken");
    expect(recipe.tags).toContain("ai-generated");
    expect(recipe.tags).toContain("italian");
  });

  it("does not duplicate ai-generated when the model already includes it", async () => {
    const u = await newUserId();
    const dup = { ...VALID_RECIPE, tags: ["ai-generated", "italian"] };
    __setTestClient(makeFakeClient([makeChatResponse(dup)]));

    const recipe = await generateRecipeFromText(u, "chicken");
    const aiTagCount = recipe.tags.filter((t) => t === "ai-generated").length;
    expect(aiTagCount).toBe(1);
  });

  describe("defensive error paths", () => {
    function makeBadResponse(content: string | null) {
      return {
        id: "x",
        object: "chat.completion",
        created: 0,
        model: "gpt-4.1-mini",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content, refusal: null },
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    }

    it("throws when the model returns empty content twice", async () => {
      const u = await newUserId();
      __setTestClient(
        makeFakeClient([makeBadResponse(null), makeBadResponse(null)])
      );
      await expect(generateRecipeFromText(u, "x")).rejects.toThrow(
        /Empty response/
      );
    });

    it("throws when the model returns non-JSON content twice", async () => {
      const u = await newUserId();
      __setTestClient(
        makeFakeClient([
          makeBadResponse("not json at all"),
          makeBadResponse("still not json"),
        ])
      );
      await expect(generateRecipeFromText(u, "x")).rejects.toThrow(
        /non-JSON content/
      );
    });

    it("throws when the model returns JSON null twice (not an object)", async () => {
      const u = await newUserId();
      __setTestClient(
        makeFakeClient([
          makeBadResponse("null"),
          makeBadResponse("null"),
        ])
      );
      await expect(generateRecipeFromText(u, "x")).rejects.toThrow(
        /not a JSON object/
      );
    });
  });
});

describe("getOpenAI", () => {
  it("throws when GPTGOD_KEY is not set", () => {
    __resetClient();
    const original = process.env.GPTGOD_KEY;
    delete process.env.GPTGOD_KEY;
    try {
      expect(() => getOpenAI()).toThrow(/GPTGOD_KEY is required/);
    } finally {
      if (original !== undefined) process.env.GPTGOD_KEY = original;
    }
  });
});

describe("generateRecipeFromImage", () => {
  it("returns a validated payload for a JPEG data URL", async () => {
    const u = await newUserId();
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const recipe = await generateRecipeFromImage(
      u,
      "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    );

    expect(recipe.title).toBe("Pasta Aglio e Olio");
    expect(recipe.tags).toContain("ai-generated");
  });

  it("rejects a non-data-URL string", async () => {
    const u = await newUserId();
    __setTestClient(makeFakeClient([])); // shouldn't reach the client

    await expect(
      generateRecipeFromImage(u, "just-a-plain-string")
    ).rejects.toThrow(/Invalid image data URL/);
  });

  it("rejects a data URL with an unsupported media type", async () => {
    const u = await newUserId();
    __setTestClient(makeFakeClient([]));

    await expect(
      generateRecipeFromImage(u, "data:application/pdf;base64,abc")
    ).rejects.toThrow(/Invalid image data URL/);
  });
});

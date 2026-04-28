import { describe, it, expect, afterEach } from "vitest";
import {
  generateRecipeFromText,
  __setTestClient,
  __resetClient,
} from "@/lib/ai-recipe";

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
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const recipe = await generateRecipeFromText("chicken and rice");

    expect(recipe.title).toBe("Pasta Aglio e Olio");
    expect(recipe.servings).toBe(2);
    expect(recipe.ingredients).toHaveLength(2);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import {
  AISLES,
  keywordClassify,
  classifyIngredients,
} from "@/lib/ingredient-aisles";
import { __setTestClient, __resetClient } from "@/lib/ai-recipe";
import { getDb } from "@/lib/db";

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
    id: "x", object: "chat.completion", created: 0, model: "gpt-4.1-mini",
    choices: [{
      index: 0, finish_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(payload), refusal: null },
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

afterEach(() => __resetClient());

describe("AISLES", () => {
  it("has exactly 7 entries with Other last", () => {
    expect(AISLES).toHaveLength(7);
    expect(AISLES[AISLES.length - 1]).toBe("Other");
  });
});

describe("keywordClassify", () => {
  it("matches common produce", () => {
    expect(keywordClassify("tomato")).toBe("Produce");
    expect(keywordClassify("Yellow Onion")).toBe("Produce");
  });

  it("matches dairy", () => {
    expect(keywordClassify("milk")).toBe("Dairy & Eggs");
    expect(keywordClassify("eggs")).toBe("Dairy & Eggs");
  });

  it("matches meat", () => {
    expect(keywordClassify("chicken thighs")).toBe("Meat & Seafood");
  });

  it("returns null for unknown items", () => {
    expect(keywordClassify("xyzzy")).toBeNull();
  });
});

describe("classifyIngredients", () => {
  it("returns keyword classifications without calling the LLM", async () => {
    __setTestClient(makeFakeClient([])); // no LLM calls allowed

    const result = await classifyIngredients(["tomato", "milk", "chicken"]);
    expect(result["tomato"]).toBe("Produce");
    expect(result["milk"]).toBe("Dairy & Eggs");
    expect(result["chicken"]).toBe("Meat & Seafood");
  });

  it("calls the LLM for unknown items and writes results to the cache", async () => {
    __setTestClient(makeFakeClient([
      makeChatResponse({
        classifications: [
          { item: "yuzu", aisle: "Produce" },
          { item: "buttermilk", aisle: "Dairy & Eggs" },
        ],
      }),
    ]));

    const result = await classifyIngredients(["yuzu", "buttermilk"]);
    expect(result["yuzu"]).toBe("Produce");
    expect(result["buttermilk"]).toBe("Dairy & Eggs");

    // Cache should now contain both entries.
    const cached = await getDb().query<{ item_normalized: string; aisle: string }>(
      "select item_normalized, aisle from ingredient_aisles order by item_normalized"
    );
    expect(cached.rows.map((r) => r.item_normalized).sort()).toEqual(["buttermilk", "yuzu"]);
  });

  it("hits the cache on a second call for the same items (no LLM needed)", async () => {
    // First call seeds the cache via LLM.
    __setTestClient(makeFakeClient([
      makeChatResponse({
        classifications: [{ item: "yuzu", aisle: "Produce" }],
      }),
    ]));
    await classifyIngredients(["yuzu"]);

    // Second call: fake client throws if asked, but it shouldn't be asked.
    __setTestClient(makeFakeClient([])); // empty
    const second = await classifyIngredients(["yuzu"]);
    expect(second["yuzu"]).toBe("Produce");
  });

  it("falls back to Other when the LLM call fails", async () => {
    __setTestClient({
      chat: {
        completions: {
          create: async () => {
            throw new Error("network down");
          },
        },
      },
    } as unknown as Parameters<typeof __setTestClient>[0]);

    const result = await classifyIngredients(["zogglefruit"]);
    expect(result["zogglefruit"]).toBe("Other");
  });
});

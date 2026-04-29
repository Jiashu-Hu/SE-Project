import { describe, it, expect, beforeEach } from "vitest";
import {
  generateRecipeFromText,
  __setTestClient,
  __resetClient,
} from "@/lib/ai-recipe";
import { listUserCatalog } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";

let lastSystemPrompt = "";

// The stub returns ingredient names that are NOT in the global seed so the
// "auto-creates per-user catalog entries" test exercises the user-row path
// instead of returning the existing seed rows unchanged.
function makeStubClient() {
  return {
    chat: {
      completions: {
        create: async (req: { messages: { role: string; content: string }[] }) => {
          lastSystemPrompt = req.messages.find((m) => m.role === "system")?.content ?? "";
          const body = JSON.stringify({
            title: "Stub",
            description: "x",
            category: "Dinner",
            prepTime: 1,
            cookTime: 1,
            servings: 2,
            ingredients: [
              { amount: "1", unit: "cup", item: "Sorrel" },
              { amount: "2", unit: "tbsp", item: "Jicama" },
            ],
            instructions: ["x"],
            tags: [],
          });
          return {
            choices: [{ message: { content: body } }],
          };
        },
      },
    },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

async function newUser() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  return reg.user.id;
}

beforeEach(() => {
  lastSystemPrompt = "";
  __resetClient();
});

describe("generateRecipeFromText catalog integration", () => {
  it("includes catalog hints in the system prompt", async () => {
    const u = await newUser();
    // Use non-seed names so they land as user-scoped rows (which sort first
    // in listUserCatalog and therefore survive the slice(0, 80) in the
    // hint builder, regardless of how big the global seed grows).
    const { getOrCreateIngredient } = await import("@/lib/ingredients");
    await getOrCreateIngredient(u, "Sorrel");
    await getOrCreateIngredient(u, "Jicama");
    __setTestClient(makeStubClient());
    await generateRecipeFromText(u, "Make me lunch.");
    expect(lastSystemPrompt).toMatch(/Sorrel/);
    expect(lastSystemPrompt).toMatch(/Jicama/);
  });

  it("auto-creates per-user catalog entries from AI output", async () => {
    const u = await newUser();
    __setTestClient(makeStubClient());
    await generateRecipeFromText(u, "Make me lunch.");
    const catalog = await listUserCatalog(u);
    // Filter to source === "ai" so the assertion is deterministic against
    // the ~200 seed globals present from the test bootstrap.
    const ai = catalog.filter((c) => c.source === "ai");
    expect(ai.map((c) => c.name).sort()).toEqual(["Jicama", "Sorrel"]);
    expect(ai.length).toBe(2);
  });
});

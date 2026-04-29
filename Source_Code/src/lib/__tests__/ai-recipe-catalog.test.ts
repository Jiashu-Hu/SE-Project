import { describe, it, expect, beforeEach } from "vitest";
import {
  generateRecipeFromText,
  __setTestClient,
  __resetClient,
} from "@/lib/ai-recipe";
import { listUserCatalog, seedGlobal } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";

let lastSystemPrompt = "";

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
              { amount: "1", unit: "cup", item: "Quinoa" },
              { amount: "2", unit: "tbsp", item: "Olive oil" },
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
    await seedGlobal([
      { name: "Olive oil", defaultUnit: "tbsp", aisle: "Pantry" },
      { name: "Salt",      defaultUnit: "tsp",  aisle: "Pantry" },
    ]);
    __setTestClient(makeStubClient());
    await generateRecipeFromText(u, "Make me lunch.");
    expect(lastSystemPrompt).toMatch(/Olive oil/);
    expect(lastSystemPrompt).toMatch(/Salt/);
  });

  it("auto-creates per-user catalog entries from AI output", async () => {
    const u = await newUser();
    __setTestClient(makeStubClient());
    await generateRecipeFromText(u, "Make me lunch.");
    const catalog = await listUserCatalog(u);
    expect(catalog.map((c) => c.name).sort()).toEqual(["Olive oil", "Quinoa"]);
    const ai = catalog.filter((c) => c.source === "ai");
    expect(ai.length).toBe(2);
  });
});

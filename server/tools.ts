import type Anthropic from "@anthropic-ai/sdk";
import { insertMeal, updateMeal, deleteMeal, listMeals } from "./db";

// USDA FoodData Central. DEMO_KEY works for light testing (low rate limit);
// set FDC_API_KEY in .env for real use.
const FDC_API_KEY = process.env.FDC_API_KEY || "DEMO_KEY";

// Tool schemas handed to Claude. Descriptions are prescriptive about WHEN to call.
export const tools: Anthropic.Tool[] = [
  {
    name: "lookup_nutrition",
    description:
      "Look up real nutrition data (per 100g) from the USDA FoodData Central database. " +
      "Call this FIRST whenever the user names a food but does not give explicit macro numbers, " +
      "so you can ground your estimate in real data. Returns up to 5 candidate foods with " +
      "calories/protein/fat/carbs per 100g. The database is strongest for whole/raw ingredients " +
      "and branded products; for homemade composite dishes (e.g. сырники) it may have no good " +
      "match — in that case ignore the results and estimate the nutrition from your own knowledge. " +
      "Use simple English search terms for best results (e.g. 'banana', 'chicken breast').",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Food name to search for. English terms work best.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "add_meal",
    description:
      "Record a meal in the journal. Pass the FINAL computed totals for the whole portion " +
      "the user ate (not per 100g). Always provide calories, protein, fat and carbs in grams. " +
      "Include grams if the portion size is known. Use this once you have decided the numbers.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable meal name, e.g. 'Сырники'." },
        grams: { type: "number", description: "Portion size in grams, if known." },
        calories: { type: "number", description: "Total kcal for the portion." },
        protein: { type: "number", description: "Total protein in grams." },
        fat: { type: "number", description: "Total fat in grams." },
        carbs: { type: "number", description: "Total carbohydrates in grams." },
        eaten_at: {
          type: "string",
          description: "ISO 8601 timestamp of when it was eaten. Defaults to now if omitted.",
        },
      },
      required: ["name", "calories", "protein", "fat", "carbs"],
    },
  },
  {
    name: "update_meal",
    description:
      "Correct an existing journal entry. Use this when the user says a recorded value is wrong " +
      "(e.g. 'there was 20g more protein'). Only pass the fields that change — others stay as-is. " +
      "If the user describes a relative change, compute the new absolute value yourself. " +
      "Call list_meals first if you don't already know the entry id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "The id of the meal to update." },
        name: { type: "string" },
        grams: { type: "number" },
        calories: { type: "number" },
        protein: { type: "number" },
        fat: { type: "number" },
        carbs: { type: "number" },
        eaten_at: { type: "string", description: "ISO 8601 timestamp." },
      },
      required: ["id"],
    },
  },
  {
    name: "list_meals",
    description:
      "List all journal entries (most recent first) with their ids and nutrition. " +
      "Use this to find the entry to correct or delete, or to answer questions about eating history.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "delete_meal",
    description:
      "Delete a journal entry by id. Use this when the user asks to remove a meal " +
      "(e.g. 'удали сырники', 'I didn't actually eat that'). Call list_meals first if you " +
      "don't already know the id. Deletion is permanent.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "The id of the meal to delete." },
      },
      required: ["id"],
    },
  },
];

type FdcFood = {
  description?: string;
  dataType?: string;
  foodNutrients?: { nutrientId?: number; value?: number }[];
};

// Per-100g nutrient value by USDA nutrientId (energy tries plain kcal then Atwater).
function nutrient(food: FdcFood, ids: number[]): number | null {
  for (const n of food.foodNutrients ?? []) {
    if (n.nutrientId != null && ids.includes(n.nutrientId) && n.value != null) {
      return n.value;
    }
  }
  return null;
}

async function lookupNutrition(query: string) {
  const url =
    "https://api.nal.usda.gov/fdc/v1/foods/search?" +
    new URLSearchParams({
      api_key: FDC_API_KEY,
      query,
      pageSize: "5",
      dataType: "Foundation,SR Legacy,Branded",
    }).toString();

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return {
        matches: [],
        note: `USDA FDC returned ${res.status}. Estimate the nutrition yourself.`,
      };
    }
    const data = (await res.json()) as { foods?: FdcFood[] };
    const matches = (data.foods ?? [])
      .map((f) => ({
        name: f.description ?? "(unnamed)",
        source: f.dataType,
        per_100g: {
          calories: nutrient(f, [1008, 2047, 2048]),
          protein: nutrient(f, [1003]),
          fat: nutrient(f, [1004]),
          carbs: nutrient(f, [1005]),
        },
      }))
      .filter((m) => m.per_100g.calories != null);

    return {
      matches,
      note:
        matches.length === 0
          ? "No usable database match — estimate the nutrition yourself."
          : "Values are per 100g. Scale to the eaten portion.",
    };
  } catch (err) {
    return {
      matches: [],
      note: `Lookup failed (${(err as Error).message}). Estimate the nutrition yourself.`,
    };
  }
}

// Executes a tool call and returns a stringified result for the tool_result block.
export async function runTool(name: string, input: any): Promise<string> {
  switch (name) {
    case "lookup_nutrition":
      return JSON.stringify(await lookupNutrition(String(input.query ?? "")));

    case "add_meal": {
      const meal = insertMeal({
        name: input.name,
        grams: input.grams ?? null,
        calories: Number(input.calories) || 0,
        protein: Number(input.protein) || 0,
        fat: Number(input.fat) || 0,
        carbs: Number(input.carbs) || 0,
        eaten_at: input.eaten_at,
      });
      return JSON.stringify({ ok: true, meal });
    }

    case "update_meal": {
      const id = Number(input.id);
      if (!Number.isFinite(id)) {
        return JSON.stringify({ ok: false, error: "Missing or invalid meal id." });
      }
      const { id: _omit, ...fields } = input;
      const meal = updateMeal(id, fields);
      if (!meal) return JSON.stringify({ ok: false, error: `No meal with id ${id}.` });
      return JSON.stringify({ ok: true, meal });
    }

    case "delete_meal": {
      const id = Number(input.id);
      if (!Number.isFinite(id)) {
        return JSON.stringify({ ok: false, error: "Missing or invalid meal id." });
      }
      const removed = deleteMeal(id);
      if (!removed) return JSON.stringify({ ok: false, error: `No meal with id ${id}.` });
      return JSON.stringify({ ok: true, deleted_id: id });
    }

    case "list_meals":
      return JSON.stringify({ meals: listMeals() });

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  }
}

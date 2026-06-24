import type Anthropic from "@anthropic-ai/sdk";
import { insertMeal, updateMeal, listMeals } from "./db";

// Tool schemas handed to Claude. Descriptions are prescriptive about WHEN to call.
export const tools: Anthropic.Tool[] = [
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
      "Use this to find the entry to correct, or to answer questions about eating history.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

// Executes a tool call and returns a stringified result for the tool_result block.
export async function runTool(name: string, input: any): Promise<string> {
  switch (name) {
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

    case "list_meals":
      return JSON.stringify({ meals: listMeals() });

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  }
}

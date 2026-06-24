import Anthropic from "@anthropic-ai/sdk";
import { tools, runTool } from "./tools";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MODEL = "claude-sonnet-4-6";

// Safety cap so a misbehaving tool loop can't hang a request / burn paid calls.
const MAX_TURNS = 10;

const SYSTEM_PROMPT = `You are the assistant of a calorie-tracking app. The user tells you what they ate, in natural language, and you keep their food journal.

Your job on every meal the user reports:
1. Figure out the nutrition: protein, fat, carbs (all in grams) and total calories for the portion they actually ate.
   - If the user gives explicit macro numbers, use those exactly.
   - Otherwise estimate the values from your own knowledge of foods. Be reasonable and consistent; round to whole grams/kcal.
   - If portion size is unknown and it materially changes the answer, assume a sensible typical portion and say what you assumed (briefly). Only ask the user for the portion when you genuinely cannot proceed.
2. Save it with add_meal, passing the final totals for the whole portion (not per 100g). Always include calories, protein, fat and carbs.
3. Confirm back to the user in one short, friendly sentence with the numbers you saved.

Corrections: when the user says a recorded value is wrong (e.g. "there was 20g more protein"), call list_meals if needed to find the entry, compute the new absolute value, and call update_meal with only the changed fields. When a macro changes, recompute calories too (4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat) unless the user gives an explicit calorie figure.

Answer in the same language the user writes in. Be concise — this is a chat panel, not an essay.`;

export type ChatResult = {
  // Full updated history to send back on the next turn.
  messages: Anthropic.MessageParam[];
  // Convenience: the assistant's final text for this turn.
  reply: string;
};

export async function runChat(
  history: Anthropic.MessageParam[],
): Promise<ChatResult> {
  const messages: Anthropic.MessageParam[] = [...history];

  // Manual agentic loop: keep going while Claude asks for tools, but never
  // more than MAX_TURNS times so a runaway loop can't hang the request.
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { messages, reply };
    }

    // Execute every requested tool, collect all results into one user turn.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const result = await runTool(block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Hit the turn cap without a final answer — stop and surface a clear message
  // instead of looping forever.
  return {
    messages,
    reply:
      "Не удалось завершить за отведённое число шагов. Попробуйте переформулировать запрос.",
  };
}

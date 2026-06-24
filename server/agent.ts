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
   - Otherwise call lookup_nutrition to get real per-100g data from USDA FoodData Central, then scale to the eaten portion. The database is best for whole/raw ingredients and branded products; for homemade composite dishes (e.g. сырники) it often has no good match — then estimate the values from your own knowledge.
   - If portion size is unknown and it materially changes the answer, assume a sensible typical portion and say what you assumed (briefly). Only ask the user for the portion when you genuinely cannot proceed.
2. Save it with add_meal, passing the final totals for the whole portion (not per 100g). Always include calories, protein, fat and carbs.
3. Confirm back to the user in one short, friendly sentence with the numbers you saved.

Corrections: when the user says a recorded value is wrong (e.g. "there was 20g more protein"), call list_meals if needed to find the entry, compute the new absolute value, and call update_meal with only the changed fields. When a macro changes, recompute calories too (4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat) unless the user gives an explicit calorie figure.

Deletion: when the user asks to remove a meal, call list_meals if needed to find the id, then call delete_meal. Confirm what you removed.

Answer in the same language the user writes in. Be concise — this is a chat panel, not an essay.`;

export type ToolCall = { name: string; input: unknown };

// A flat, render-ready view of the shared conversation. Internal tool_result
// turns are dropped; tool_use blocks become visible "tool" items.
export type ChatView =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; input: unknown };

export function toChatView(history: Anthropic.MessageParam[]): ChatView[] {
  const view: ChatView[] = [];
  for (const msg of history) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        if (msg.content.trim()) view.push({ kind: "user", text: msg.content });
      }
      // array content on a user turn = tool_result blocks → internal, skip
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        if (msg.content.trim()) view.push({ kind: "assistant", text: msg.content });
        continue;
      }
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      for (const b of blocks) {
        if (b.type === "text" && b.text.trim()) {
          view.push({ kind: "assistant", text: b.text });
        } else if (b.type === "tool_use") {
          view.push({ kind: "tool", name: b.name, input: b.input });
        }
      }
    }
  }
  return view;
}

export type ChatResult = {
  // Full updated history to send back on the next turn.
  messages: Anthropic.MessageParam[];
  // Convenience: the assistant's final text for this turn.
  reply: string;
  // Tools Claude invoked during this turn, in order (for chat visualization).
  toolCalls: ToolCall[];
};

export async function runChat(
  history: Anthropic.MessageParam[],
  // Called after every message is appended, with just the messages generated
  // this turn (assistant turns + tool results). Lets the caller persist the
  // shared transcript incrementally so a mid-loop API failure — after a tool
  // already mutated the DB — doesn't lose the record and cause a dup on retry.
  persist?: (generated: Anthropic.MessageParam[]) => void,
): Promise<ChatResult> {
  const messages: Anthropic.MessageParam[] = [...history];
  const startLen = messages.length;
  const toolCalls: ToolCall[] = [];
  const save = () => persist?.(messages.slice(startLen));

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
      save(); // valid terminal state (assistant text, no pending tool_use)
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { messages, reply, toolCalls };
    }
    // Don't persist the lone tool_use turn here — an orphaned tool_use (without
    // its tool_result) is an invalid history. Save below, together with results.

    // Execute every requested tool, collect all results into one user turn.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolCalls.push({ name: block.name, input: block.input });
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
    save(); // persist tool results (the mutation record) before the next call
  }

  // Hit the turn cap without a final answer — append a visible message to the
  // history (so it shows in the shared chat) instead of looping forever.
  const fallback =
    "Не удалось завершить за отведённое число шагов. Попробуйте переформулировать запрос.";
  messages.push({ role: "assistant", content: fallback });
  save();
  return { messages, reply: fallback, toolCalls };
}

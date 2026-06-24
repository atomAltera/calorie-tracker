import { listMeals, deleteMeal, loadHistory, saveHistory } from "./db";
import { runChat, toChatView } from "./agent";
import type Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT ?? 3000);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Serialize chat turns so concurrent requests can't interleave history writes.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// Cap how much of the (unbounded, shared) transcript we send to the model so a
// long-running chat can't blow the context window. The full history is still
// saved for display — we only trim what's passed to Claude, and we start the
// window at a clean user-turn boundary so tool_use/tool_result pairs stay intact.
const MAX_MODEL_MSGS = 40;
function boundForModel(
  history: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (history.length <= MAX_MODEL_MSGS) return history;
  let start = history.length - MAX_MODEL_MSGS;
  while (
    start < history.length &&
    !(history[start].role === "user" && typeof history[start].content === "string")
  ) {
    start++;
  }
  // The just-pushed user message guarantees at least one valid boundary.
  return history.slice(Math.min(start, history.length - 1));
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // GET /api/meals — journal contents for the left panel.
    if (url.pathname === "/api/meals" && req.method === "GET") {
      return json({ meals: listMeals() });
    }

    // DELETE /api/meals/:id — remove an entry (journal delete button).
    const del = url.pathname.match(/^\/api\/meals\/(\d+)$/);
    if (del && req.method === "DELETE") {
      const removed = deleteMeal(Number(del[1]));
      return removed ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }

    // GET /api/messages — the shared conversation, render-ready (polled by clients).
    if (url.pathname === "/api/messages" && req.method === "GET") {
      return json({ messages: toChatView(loadHistory() as Anthropic.MessageParam[]) });
    }

    // POST /api/chat — append one user message to the shared conversation and run a turn.
    if (url.pathname === "/api/chat" && req.method === "POST") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return json(
          { error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env." },
          500,
        );
      }
      let text = "";
      try {
        const body = (await req.json()) as { message?: unknown };
        text = String(body.message ?? "").trim();
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }
      if (!text) return json({ error: "Empty message." }, 400);

      try {
        await withLock(async () => {
          const full = loadHistory() as Anthropic.MessageParam[];
          full.push({ role: "user", content: text });
          // Persist the user turn up front so it survives even a first-call failure.
          saveHistory(full);
          // Run the model on a bounded window; persist incrementally so the full
          // shared transcript stays consistent with DB mutations even if a later
          // call in the loop fails. `generated` is everything produced this turn.
          const window = boundForModel(full);
          await runChat(window, (generated) => saveHistory([...full, ...generated]));
        });
        return json({
          messages: toChatView(loadHistory() as Anthropic.MessageParam[]),
        });
      } catch (err) {
        console.error(err);
        return json({ error: (err as Error).message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`API listening on http://localhost:${server.port}`);

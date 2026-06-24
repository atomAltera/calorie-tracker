import { listMeals } from "./db";
import { runChat } from "./agent";

const PORT = Number(process.env.PORT ?? 3000);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // GET /api/meals — journal contents for the left panel.
    if (url.pathname === "/api/meals" && req.method === "GET") {
      return json({ meals: listMeals() });
    }

    // POST /api/chat — run one chat turn (with the tool loop).
    if (url.pathname === "/api/chat" && req.method === "POST") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return json(
          { error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env." },
          500,
        );
      }
      try {
        const body = (await req.json()) as { messages?: unknown };
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const result = await runChat(messages as any);
        return json(result);
      } catch (err) {
        console.error(err);
        return json({ error: (err as Error).message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`API listening on http://localhost:${server.port}`);

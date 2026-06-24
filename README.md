# Calorie Tracker (MVP)

AI-chat calorie tracker. Split screen: **journal on the left, chat on the right.**
You tell the assistant what you ate in natural language; it computes the nutrition
(protein / fat / carbs / calories) via function calling and records it. You can also
correct ("в сырниках белка на 20 г больше") or delete entries.

- **Backend:** Bun + `bun:sqlite` + `@anthropic-ai/sdk` (model `claude-sonnet-4-6`).
- **Frontend:** React + Vite + TypeScript.
- **Nutrition (hybrid):** the model looks up USDA FoodData Central for real per-100g
  data; for homemade dishes with no good match it estimates from its own knowledge.
- **Shared chat:** one global conversation persisted server-side — every visitor sees
  the same chat, which polls for updates. Tool calls are shown as chips in the chat.

## Setup

1. Install Bun if needed: `brew install oven-sh/bun/bun` (or `curl -fsSL https://bun.sh/install | bash`)
2. Add your keys to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   FDC_API_KEY=            # USDA FoodData Central; blank = shared DEMO_KEY (low limit)
   ```
3. Install deps: `bun run setup`  (installs root + `web/`)

## Run

```
bun run dev
```

- API → http://localhost:3000
- App → http://localhost:5173  ← open this

Vite proxies `/api/*` to the Bun server.

## Try it

- "Съел банан" / "150 г куриной грудки" → triggers a USDA lookup (you'll see a
  `🔍 Поиск в USDA` chip), then a journal row appears.
- "Съел сырники, 200 грамм" → no USDA match → model estimates and records.
- "В сырниках белка на 20 г больше" → the entry updates.
- "Удали банан" → the entry is removed (or use the ✕ button on a journal row).
- "Съел 30 г белка, 10 г жира, 40 г углеводов" → recorded as given.

## Share via ngrok

Tunnel the **Vite** port (it proxies `/api` to the backend); `*.ngrok-free.app` is
already allowed in `vite.config.ts`:

```
bun run dev
ngrok http 5173
```

## LLM tools (function calling)

Defined in `server/tools.ts`, driven by the manual agent loop in `server/agent.ts`:

- `lookup_nutrition(query)` — USDA FoodData Central search (per-100g macros).
- `add_meal(...)` — write a journal entry (final totals for the portion).
- `update_meal(id, ...)` — correct an entry (only changed fields).
- `delete_meal(id)` — remove an entry.
- `list_meals()` — read the journal / find an entry to correct or delete.

## Layout

```
server/  index.ts (HTTP)  db.ts (sqlite)  tools.ts (LLM tools)  agent.ts (Claude loop)
web/     src/App.tsx  components/{Journal,Chat}.tsx  api.ts  styles.css
```

The `meals` table and tool set are deliberately generic so other activity types
(sleep, workouts) can be added later. MVP only: no auth, no tests, no migrations.

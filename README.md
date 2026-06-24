# Calorie Tracker (MVP)

AI-chat calorie tracker. Split screen: **journal on the left, chat on the right.**
You tell the assistant what you ate in natural language; it computes the nutrition
(protein / fat / carbs / calories) via function calling and records it. You can also
correct entries ("в сырниках белка на 20 г больше").

- **Backend:** Bun + `bun:sqlite` + `@anthropic-ai/sdk` (model `claude-sonnet-4-6`).
- **Frontend:** React + Vite + TypeScript.
- **Nutrition:** Claude estimates protein / fat / carbs / calories from its own
  knowledge (no external food provider yet — that's a later add-on).

## Setup

1. Install Bun if needed: `curl -fsSL https://bun.sh/install | bash`
2. Add your key to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
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

- "Съел сырники, 200 грамм" → assistant confirms КБЖУ, a row appears in the journal.
- "В сырниках белка на 20 г больше" → the entry updates.
- "Съел 30 г белка, 10 г жира, 40 г углеводов" → recorded as given.

## LLM tools (function calling)

Defined in `server/tools.ts`, driven by the manual agent loop in `server/agent.ts`:

- `add_meal(...)` — write a journal entry (final totals for the portion).
- `update_meal(id, ...)` — correct an entry (only changed fields).
- `list_meals()` — read the journal / find an entry to correct.

## Layout

```
server/  index.ts (HTTP)  db.ts (sqlite)  tools.ts (LLM tools)  agent.ts (Claude loop)
web/     src/App.tsx  components/{Journal,Chat}.tsx  api.ts  styles.css
```

The `meals` table and tool set are deliberately generic so other activity types
(sleep, workouts) can be added later. MVP only: no auth, no tests, no migrations.

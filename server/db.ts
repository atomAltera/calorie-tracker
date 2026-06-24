import { Database } from "bun:sqlite";

// Single-file SQLite DB living next to the server. Created on first run.
const db = new Database("calorie-tracker.sqlite", { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS meals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    grams      REAL,
    calories   REAL    NOT NULL DEFAULT 0,
    protein    REAL    NOT NULL DEFAULT 0,
    fat        REAL    NOT NULL DEFAULT 0,
    carbs      REAL    NOT NULL DEFAULT 0,
    eaten_at   TEXT    NOT NULL,
    created_at TEXT    NOT NULL
  )
`);

// Single shared conversation, persisted as one JSON blob (Anthropic history).
db.run(`
  CREATE TABLE IF NOT EXISTS chat (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    history TEXT NOT NULL
  )
`);

export function loadHistory(): unknown[] {
  const row = db.query("SELECT history FROM chat WHERE id = 1").get() as
    | { history: string }
    | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.history);
  } catch {
    return [];
  }
}

export function saveHistory(history: unknown[]): void {
  db.query(
    `INSERT INTO chat (id, history) VALUES (1, $h)
     ON CONFLICT(id) DO UPDATE SET history = $h`,
  ).run({ $h: JSON.stringify(history) });
}

export type Meal = {
  id: number;
  name: string;
  grams: number | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  eaten_at: string;
  created_at: string;
};

export type NewMeal = {
  name: string;
  grams?: number | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  eaten_at?: string;
};

export function listMeals(): Meal[] {
  return db
    .query("SELECT * FROM meals ORDER BY eaten_at DESC, id DESC")
    .all() as Meal[];
}

export function getMeal(id: number): Meal | null {
  return (db.query("SELECT * FROM meals WHERE id = ?").get(id) as Meal) ?? null;
}

export function insertMeal(meal: NewMeal): Meal {
  const now = new Date().toISOString();
  const row = db
    .query(
      `INSERT INTO meals (name, grams, calories, protein, fat, carbs, eaten_at, created_at)
       VALUES ($name, $grams, $calories, $protein, $fat, $carbs, $eaten_at, $created_at)
       RETURNING *`,
    )
    .get({
      $name: meal.name,
      $grams: meal.grams ?? null,
      $calories: meal.calories,
      $protein: meal.protein,
      $fat: meal.fat,
      $carbs: meal.carbs,
      $eaten_at: meal.eaten_at ?? now,
      $created_at: now,
    }) as Meal;
  return row;
}

export function deleteMeal(id: number): boolean {
  const res = db.query("DELETE FROM meals WHERE id = ?").run(id);
  return res.changes > 0;
}

// Updates only the fields that are provided (the correction case).
export function updateMeal(
  id: number,
  fields: Partial<Omit<Meal, "id" | "created_at">>,
): Meal | null {
  const allowed = [
    "name",
    "grams",
    "calories",
    "protein",
    "fat",
    "carbs",
    "eaten_at",
  ] as const;

  const sets: string[] = [];
  const params: Record<string, unknown> = { $id: id };
  for (const key of allowed) {
    if (key in fields && fields[key] !== undefined) {
      sets.push(`${key} = $${key}`);
      params[`$${key}`] = fields[key];
    }
  }
  if (sets.length === 0) return getMeal(id);

  const row = db
    .query(`UPDATE meals SET ${sets.join(", ")} WHERE id = $id RETURNING *`)
    .get(params as any) as Meal | undefined;
  return row ?? null;
}

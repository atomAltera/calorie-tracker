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

// Mirrors Anthropic message params closely enough for our round-trip.
export type ChatMessage = {
  role: "user" | "assistant";
  content: unknown;
};

export async function fetchMeals(): Promise<Meal[]> {
  const res = await fetch("/api/meals");
  if (!res.ok) throw new Error(`GET /api/meals -> ${res.status}`);
  const data = (await res.json()) as { meals: Meal[] };
  return data.meals;
}

export async function sendChat(
  messages: ChatMessage[],
): Promise<{ messages: ChatMessage[]; reply: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `POST /api/chat -> ${res.status}`);
  return data;
}

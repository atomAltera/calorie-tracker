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

// Render-ready item from the shared conversation (mirrors server ChatView).
export type ChatView =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; input: unknown };

export async function fetchMeals(): Promise<Meal[]> {
  const res = await fetch("/api/meals");
  if (!res.ok) throw new Error(`GET /api/meals -> ${res.status}`);
  const data = (await res.json()) as { meals: Meal[] };
  return data.meals;
}

export async function deleteMeal(id: number): Promise<void> {
  const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/meals/${id} -> ${res.status}`);
}

export async function fetchMessages(): Promise<ChatView[]> {
  const res = await fetch("/api/messages");
  if (!res.ok) throw new Error(`GET /api/messages -> ${res.status}`);
  const data = (await res.json()) as { messages: ChatView[] };
  return data.messages;
}

export async function sendChat(message: string): Promise<ChatView[]> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `POST /api/chat -> ${res.status}`);
  return data.messages as ChatView[];
}

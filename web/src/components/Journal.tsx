import { useEffect, useState } from "react";
import { fetchMeals, type Meal } from "../api";

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Journal({ refreshKey }: { refreshKey: number }) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMeals()
      .then((m) => !cancelled && (setMeals(m), setError(null)))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const totals = meals.reduce(
    (acc, m) => {
      acc.calories += m.calories;
      acc.protein += m.protein;
      acc.fat += m.fat;
      acc.carbs += m.carbs;
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  return (
    <div className="journal">
      <div className="journal-head">
        <h2>Журнал</h2>
        <div className="totals">
          <span className="kcal">{round(totals.calories)} ккал</span>
          <span className="macros">
            Б {round(totals.protein)} · Ж {round(totals.fat)} · У{" "}
            {round(totals.carbs)}
          </span>
        </div>
      </div>

      {error && <div className="error">Ошибка загрузки: {error}</div>}

      {meals.length === 0 && !error ? (
        <p className="empty">
          Пока пусто. Напишите в чат, что вы съели — например «съел сырники,
          200 грамм».
        </p>
      ) : (
        <ul className="meal-list">
          {meals.map((m) => (
            <li key={m.id} className="meal">
              <div className="meal-main">
                <span className="meal-name">{m.name}</span>
                {m.grams != null && (
                  <span className="meal-grams">{round(m.grams)} г</span>
                )}
              </div>
              <div className="meal-stats">
                <span className="meal-kcal">{round(m.calories)} ккал</span>
                <span className="meal-macros">
                  Б {round(m.protein)} · Ж {round(m.fat)} · У {round(m.carbs)}
                </span>
                <span className="meal-time">{formatTime(m.eaten_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

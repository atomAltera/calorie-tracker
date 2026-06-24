import { useEffect, useRef, useState } from "react";
import { fetchMessages, sendChat, type ChatView } from "../api";

const POLL_MS = 3000;

// Friendly, compact label for a tool call chip.
function toolLabel(name: string, input: any): string {
  switch (name) {
    case "lookup_nutrition":
      return `🔍 Поиск в USDA: «${input?.query ?? ""}»`;
    case "add_meal":
      return `➕ Записываю: ${input?.name ?? "приём пищи"}`;
    case "update_meal":
      return `✏️ Правлю запись #${input?.id ?? "?"}`;
    case "delete_meal":
      return `🗑️ Удаляю запись #${input?.id ?? "?"}`;
    case "list_meals":
      return "📋 Смотрю журнал";
    default:
      return `🔧 ${name}`;
  }
}

export function Chat({ onJournalChanged }: { onJournalChanged: () => void }) {
  const [view, setView] = useState<ChatView[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);

  // Initial load + periodic polling so every viewer sees the same live chat.
  useEffect(() => {
    let active = true;
    const load = () =>
      fetchMessages()
        .then((v) => active && setView(v))
        .catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  // Auto-scroll to the bottom whenever new items arrive (or while sending).
  useEffect(() => {
    if (view.length !== prevLen.current || busy) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      prevLen.current = view.length;
    }
  }, [view, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const updated = await sendChat(text);
      setView(updated);
      onJournalChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat">
      <h2>Чат <span className="shared-tag">общий</span></h2>
      <div className="messages" ref={scrollRef}>
        {view.length === 0 && (
          <div className="hint">
            Общий чат для всех, кто открыл страницу. Расскажите, что вы съели — ИИ
            посчитает КБЖУ (через базу USDA или сам) и запишет в журнал. Можно
            поправить или удалить запись.
          </div>
        )}
        {view.map((item, i) => {
          if (item.kind === "tool") {
            return (
              <div key={i} className="tool-chip">
                {toolLabel(item.name, item.input)}
              </div>
            );
          }
          return (
            <div key={i} className={`bubble ${item.kind}`}>
              {item.text}
            </div>
          );
        })}
        {busy && <div className="bubble assistant pending">…считаю</div>}
        {error && <div className="bubble error">Ошибка: {error}</div>}
      </div>
      <div className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Например: съел сырники, 200 грамм"
          rows={2}
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          Отправить
        </button>
      </div>
    </div>
  );
}

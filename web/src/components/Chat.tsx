import { useEffect, useRef, useState } from "react";
import { sendChat, type ChatMessage } from "../api";

type Bubble = { role: "user" | "assistant"; text: string };

// Extract readable text from an Anthropic-style content value.
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n");
  }
  return "";
}

export function Chat({ onJournalChanged }: { onJournalChanged: () => void }) {
  // Full Anthropic history (sent to the API each turn).
  const [history, setHistory] = useState<ChatMessage[]>([]);
  // Display bubbles (user + assistant text only).
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [bubbles, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const nextHistory = [...history, userMsg];

    setBubbles((b) => [...b, { role: "user", text }]);
    setHistory(nextHistory);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const result = await sendChat(nextHistory);
      setHistory(result.messages);
      setBubbles((b) => [
        ...b,
        {
          role: "assistant",
          text:
            result.reply ||
            textOf(result.messages[result.messages.length - 1]?.content),
        },
      ]);
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
      <h2>Чат</h2>
      <div className="messages" ref={scrollRef}>
        {bubbles.length === 0 && (
          <div className="hint">
            Расскажите, что вы съели — ИИ посчитает КБЖУ и запишет в журнал.
            Можно и поправить запись: «в сырниках белка на 20 г больше».
          </div>
        )}
        {bubbles.map((b, i) => (
          <div key={i} className={`bubble ${b.role}`}>
            {b.text}
          </div>
        ))}
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

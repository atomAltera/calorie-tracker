import { useCallback, useState } from "react";
import { Journal } from "./components/Journal";
import { Chat } from "./components/Chat";

export function App() {
  // Bump this to tell the Journal to refetch (after a chat turn mutates data).
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshJournal = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🍽️ Calorie Tracker</h1>
        <span className="subtitle">Журнал питания на базе ИИ</span>
      </header>
      <main className="split">
        <section className="pane pane-journal">
          <Journal refreshKey={refreshKey} />
        </section>
        <section className="pane pane-chat">
          <Chat onJournalChanged={refreshJournal} />
        </section>
      </main>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";

const initialTasks = [];

const PRIORITIES = {
  high: { label: "High", color: "#ff4757", bg: "#ff475715" },
  medium: { label: "Medium", color: "#ffa502", bg: "#ffa50215" },
  low: { label: "Low", color: "#2ed573", bg: "#2ed57315" },
};

function useTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(d) {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export default function App() {
  const [tasks, setTasks] = useState(initialTasks);
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState("medium");
  const [showPanel, setShowPanel] = useState(false);
  const [notif, setNotif] = useState(null);
  const [shake, setShake] = useState(false);
  const now = useTime();
  const notifRef = useRef(null);

  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  function addTask() {
    const trimmed = input.trim();
    if (!trimmed) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    const task = { id: Date.now(), text: trimmed, priority, done: false, addedAt: new Date() };
    setTasks((prev) => [...prev, task]);
    setInput("");
    triggerNotif(`Task added: "${trimmed}"`);
  }

  function toggleTask(id) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, done: !t.done };
        if (updated.done) triggerNotif(`✓ Completed: "${t.text}"`);
        return updated;
      })
    );
  }

  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function triggerNotif(msg) {
    clearTimeout(notifRef.current);
    setNotif(msg);
    notifRef.current = setTimeout(() => setNotif(null), 3000);
  }

  function sendBrowserNotif() {
    if (!("Notification" in window)) return alert("Browser notifications not supported.");
    Notification.requestPermission().then((p) => {
      if (p === "granted") {
        const pending = tasks.filter((t) => !t.done);
        const body =
          pending.length === 0
            ? "🎉 All tasks complete!"
            : pending.map((t) => `• ${t.text}`).join("\n");
        new Notification("Today's Tasks — Super Productivity", { body, icon: "" });
      } else {
        alert("Notification permission denied.");
      }
    });
  }

  const sorted = [...tasks].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    if (a.done !== b.done) return a.done ? 1 : -1;
    return order[a.priority] - order[b.priority];
  });

  return (
    <div style={styles.root}>
      {/* Background noise/grain */}
      <div style={styles.grain} />

      {/* Floating notification toast */}
      <div style={{ ...styles.toast, opacity: notif ? 1 : 0, transform: notif ? "translateY(0)" : "translateY(-16px)" }}>
        {notif}
      </div>

      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.dateLabel}>{formatDate(now)}</div>
            <div style={styles.clock}>{formatTime(now)}</div>
          </div>
          <div style={styles.headerRight}>
            <button style={styles.iconBtn} title="Send browser notification" onClick={sendBrowserNotif}>
              🔔
            </button>
            <button style={styles.iconBtn} title="Add tasks" onClick={() => setShowPanel((v) => !v)}>
              {showPanel ? "✕" : "+"}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={styles.progressWrap}>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <span style={styles.progressLabel}>
            {done}/{total} done
            {progress === 100 && total > 0 ? " 🎉" : ""}
          </span>
        </div>

        {/* Add task panel */}
        {showPanel && (
          <div style={styles.addPanel}>
            <input
              style={{ ...styles.input, animation: shake ? "shake 0.4s" : "none" }}
              placeholder="New task…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              autoFocus
            />
            <div style={styles.priorityRow}>
              {Object.entries(PRIORITIES).map(([key, val]) => (
                <button
                  key={key}
                  style={{
                    ...styles.priorityBtn,
                    background: priority === key ? val.color : "transparent",
                    color: priority === key ? "#fff" : val.color,
                    border: `1.5px solid ${val.color}`,
                  }}
                  onClick={() => setPriority(key)}
                >
                  {val.label}
                </button>
              ))}
              <button style={styles.addBtn} onClick={addTask}>Add</button>
            </div>
          </div>
        )}

        {/* Task list */}
        <div style={styles.taskList}>
          {sorted.length === 0 && (
            <div style={styles.empty}>No tasks yet — click <b>+</b> to add some.</div>
          )}
          {sorted.map((task) => {
            const p = PRIORITIES[task.priority];
            return (
              <div key={task.id} style={{ ...styles.taskRow, background: task.done ? "#ffffff08" : p.bg }}>
                <button style={styles.checkBtn} onClick={() => toggleTask(task.id)}>
                  <span style={{
                    ...styles.checkCircle,
                    borderColor: task.done ? p.color : "#555",
                    background: task.done ? p.color : "transparent",
                  }}>
                    {task.done && <span style={styles.checkMark}>✓</span>}
                  </span>
                </button>
                <span style={{ ...styles.taskText, textDecoration: task.done ? "line-through" : "none", color: task.done ? "#555" : "#e0e0e0" }}>
                  {task.text}
                </span>
                <span style={{ ...styles.priorityDot, background: p.color }} title={p.label} />
                <button style={styles.removeBtn} onClick={() => removeTask(task.id)}>✕</button>
              </div>
            );
          })}
        </div>

        <div style={styles.footer}>Super Productivity · Daily Focus</div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0d0d; }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0d0d0d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Syne', sans-serif",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
  },
  grain: {
    position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'%3E%3C/feTurbulence%3E%3CfeDisplacementMap in='SourceGraphic' scale='80'%3E%3C/feDisplacementMap%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
    backgroundSize: "200px 200px", opacity: 0.4,
  },
  toast: {
    position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
    background: "#1e1e1e", color: "#e0e0e0", border: "1px solid #333",
    padding: "10px 20px", borderRadius: "999px", fontSize: "13px",
    fontFamily: "'JetBrains Mono', monospace", zIndex: 999,
    transition: "opacity 0.3s, transform 0.3s", pointerEvents: "none",
    whiteSpace: "nowrap",
  },
  card: {
    position: "relative", zIndex: 1,
    background: "#141414",
    border: "1px solid #282828",
    borderRadius: "20px",
    padding: "28px",
    width: "100%", maxWidth: "460px",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
    animation: "fadeIn 0.5s ease both",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "20px",
  },
  dateLabel: { color: "#666", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" },
  clock: { fontFamily: "'JetBrains Mono', monospace", fontSize: "28px", fontWeight: 500, color: "#f0f0f0", letterSpacing: "-0.02em" },
  headerRight: { display: "flex", gap: "8px" },
  iconBtn: {
    background: "#1e1e1e", border: "1px solid #333", color: "#aaa",
    borderRadius: "10px", width: "36px", height: "36px",
    fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.2s, color 0.2s",
  },
  progressWrap: { marginBottom: "20px" },
  progressTrack: { height: "4px", background: "#222", borderRadius: "4px", overflow: "hidden", marginBottom: "6px" },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #ff6b35, #ffd23f)", borderRadius: "4px", transition: "width 0.4s ease" },
  progressLabel: { fontSize: "11px", color: "#555", fontFamily: "'JetBrains Mono', monospace" },
  addPanel: {
    background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: "12px", padding: "14px", marginBottom: "16px",
    animation: "fadeIn 0.25s ease both",
  },
  input: {
    width: "100%", background: "#111", border: "1px solid #333", color: "#e0e0e0",
    borderRadius: "8px", padding: "10px 12px", fontSize: "14px",
    fontFamily: "'Syne', sans-serif", outline: "none", marginBottom: "10px",
  },
  priorityRow: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  priorityBtn: {
    padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
    cursor: "pointer", transition: "all 0.15s", fontFamily: "'Syne', sans-serif",
  },
  addBtn: {
    marginLeft: "auto", background: "#ff6b35", color: "#fff", border: "none",
    borderRadius: "8px", padding: "6px 16px", fontSize: "13px", fontWeight: 700,
    cursor: "pointer", fontFamily: "'Syne', sans-serif",
  },
  taskList: { display: "flex", flexDirection: "column", gap: "6px", minHeight: "60px" },
  empty: { color: "#444", fontSize: "13px", textAlign: "center", padding: "24px 0", fontStyle: "italic" },
  taskRow: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 12px", borderRadius: "10px",
    transition: "background 0.2s", animation: "fadeIn 0.2s ease both",
  },
  checkBtn: { background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 },
  checkCircle: {
    width: "18px", height: "18px", borderRadius: "50%", border: "2px solid",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s",
  },
  checkMark: { color: "#fff", fontSize: "10px", fontWeight: 700 },
  taskText: { flex: 1, fontSize: "14px", lineHeight: "1.4", transition: "all 0.2s" },
  priorityDot: { width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0 },
  removeBtn: {
    background: "none", border: "none", color: "#444", cursor: "pointer",
    fontSize: "12px", padding: "2px 4px", flexShrink: 0,
    transition: "color 0.2s",
  },
  footer: { textAlign: "center", color: "#333", fontSize: "10px", letterSpacing: "0.1em", marginTop: "20px", textTransform: "uppercase" },
};

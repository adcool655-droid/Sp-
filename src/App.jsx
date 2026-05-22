import { useState, useEffect, useCallback, useRef } from "react";

// ─── Dropbox OAuth Config ───────────────────────────────────────────────────
// Uses Dropbox's token flow (no backend needed). User must create a Dropbox App
// at https://www.dropbox.com/developers/apps with permission: files.content.read
// and add this page's origin as a redirect URI.
const DROPBOX_CLIENT_ID = "YOUR_DROPBOX_APP_KEY"; // <-- replaced by user
const REDIRECT_URI = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
const SP_FILE_PATH = "/apps/super_productivity/sync-data.json";

// ─── Helpers ────────────────────────────────────────────────────────────────
function getTokenFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.substring(1);
  const params = Object.fromEntries(new URLSearchParams(hash));
  return params.access_token || null;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate() {
  return new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function minsToHuman(ms) {
  if (!ms) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Parse SP JSON → today's tasks
function parseTodayTasks(data) {
  try {
    const taskEntities = data?.task?.entities || data?.tasks?.entities || {};
    const tags = data?.tag?.entities || data?.tags?.entities || {};

    const todayTag = Object.values(tags).find(
      (t) => t.id === "TODAY" || t.title === "Today" || t.title === "TODAY"
    );

    let todayIds = new Set();

    if (todayTag?.taskIds) {
      todayTag.taskIds.forEach((id) => todayIds.add(id));
    }

    const key = todayKey();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    Object.values(taskEntities).forEach((task) => {
      // time logged today
      if (task.timeSpentOnDay?.[key]) todayIds.add(task.id);

      // plannedAt scheduled today
      if (task.plannedAt) {
        const d = new Date(task.plannedAt);
        if (d >= todayStart && d <= todayEnd) todayIds.add(task.id);
      }

      // dueDate scheduled today (SP also uses this field)
      if (task.dueDate) {
        const d = new Date(task.dueDate);
        if (d >= todayStart && d <= todayEnd) todayIds.add(task.id);
      }

      // tagIds includes TODAY
      if (task.tagIds?.includes("TODAY")) todayIds.add(task.id);
    });
    // tagIds includes TODAY
      if (task.tagIds?.includes("TODAY")) todayIds.add(task.id);
      // dueDay field (YYYY-MM-DD format)
      if (task.dueDay) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        if (task.dueDay === todayStr) todayIds.add(task.id);
      }

    const tasks = [];
    todayIds.forEach((id) => {
      const t = taskEntities[id];
      if (!t || t.parentId) return;
      const subtasks = (t.subTaskIds || [])
        .map((sid) => taskEntities[sid])
        .filter(Boolean);
      tasks.push({ ...t, subtasks });
    });

    return tasks;
  } catch (e) {
    console.error("Parse error", e);
    return [];
  }
}
// ─── Main Component ─────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("dbx_token") || getTokenFromHash();
  });
  const [appKey, setAppKey] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("dbx_app_key") || "") : ""
  );
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [showSetup, setShowSetup] = useState(false);
  const intervalRef = useRef(null);

  // Persist token
  useEffect(() => {
    if (token) {
      sessionStorage.setItem("dbx_token", token);
      // Clean URL hash
      if (window.location.hash.includes("access_token")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [token]);

  // Check hash on load
  useEffect(() => {
    const t = getTokenFromHash();
    if (t) setToken(t);
  }, []);

  const fetchTasks = useCallback(async (t = token) => {
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Dropbox-API-Arg": JSON.stringify({ path: SP_FILE_PATH }),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) { setToken(null); sessionStorage.removeItem("dbx_token"); throw new Error("Session expired. Please reconnect."); }
        throw new Error(err?.error_summary || `HTTP ${res.status}`);
      }
      const text = await res.text();
      const cleaned = text.replace(/^[^{]*/, "");
      const json = JSON.parse(cleaned);
      const today = parseTodayTasks(json);
      setTasks(today);
      setLastSync(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Auto-refresh every 5 min
  useEffect(() => {
    if (!token) return;
    fetchTasks();
    intervalRef.current = setInterval(() => fetchTasks(), 5 * 60 * 1000);
    return () => clearInterval(intervalRef.current);
  }, [token, fetchTasks]);

  function connectDropbox() {
    const key = appKey.trim();
    if (!key) { setError("Please enter your Dropbox App Key first."); return; }
    localStorage.setItem("dbx_app_key", key);
    const url = `https://www.dropbox.com/oauth2/authorize?client_id=${key}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = url;
  }

  function disconnect() {
    setToken(null);
    setTasks([]);
    sessionStorage.removeItem("dbx_token");
  }

  function sendBrowserNotif() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((p) => {
      if (p !== "granted") return;
      const pending = tasks.filter((t) => !t.isDone);
      const body = pending.length === 0
        ? "🎉 All tasks complete for today!"
        : pending.map((t) => `• ${t.title}`).join("\n");
      new Notification("Today's Tasks — Super Productivity", { body });
    });
  }

  const done = tasks.filter((t) => t.isDone).length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // ── Screens ────────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <Shell>
        <div style={s.setupCard}>
          <div style={s.logo}>⚡</div>
          <h1 style={s.title}>SP Task Notifier</h1>
          <p style={s.subtitle}>Connect your Dropbox to auto-load today's tasks from Super Productivity.</p>

          <div style={s.steps}>
            <Step n="1" text="Create a Dropbox App at dropbox.com/developers/apps" link="https://www.dropbox.com/developers/apps" />
            <Step n="2" text='Set permission "files.content.read" and add this page URL as a redirect URI' />
            <Step n="3" text="Paste your App Key below and connect" />
          </div>

          <input
            style={s.input}
            placeholder="Dropbox App Key"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connectDropbox()}
          />
          {error && <div style={s.errorMsg}>{error}</div>}
          <button style={s.connectBtn} onClick={connectDropbox}>
            Connect Dropbox →
          </button>
        </div>
        <Styles />
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.dateStr}>{formatDate()}</div>
            <div style={s.headline}>Today's Focus</div>
          </div>
          <div style={s.headerActions}>
            <IconBtn title="Send browser notification" onClick={sendBrowserNotif}>🔔</IconBtn>
            <IconBtn title="Refresh" onClick={() => fetchTasks()} disabled={loading}>
              <span style={{ display: "inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
            </IconBtn>
            <IconBtn title="Disconnect" onClick={disconnect}>⏏</IconBtn>
          </div>
        </div>

        {/* Progress */}
        <div style={s.progressArea}>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: `${pct}%` }} />
          </div>
          <div style={s.progressMeta}>
            <span style={s.progressLabel}>{done} of {total} done {pct === 100 && total > 0 ? "🎉" : ""}</span>
            {lastSync && <span style={s.syncTime}>synced {formatTime(lastSync)}</span>}
          </div>
        </div>

        {/* Error */}
        {error && <div style={s.errorMsg}>{error}</div>}

        {/* Task list */}
        <div style={s.taskList}>
          {loading && tasks.length === 0 && (
            <div style={s.emptyState}>
              <div style={s.spinner} />
              <span>Loading from Dropbox…</span>
            </div>
          )}
          {!loading && tasks.length === 0 && !error && (
            <div style={s.emptyState}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
              <span>No tasks scheduled for today.</span>
            </div>
          )}
          {tasks
            .sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1))
            .map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                expanded={expanded[task.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [task.id]: !e[task.id] }))}
              />
            ))}
        </div>

        <div style={s.footer}>
          Super Productivity × Dropbox · auto-refreshes every 5 min
        </div>
      </div>
      <Styles />
    </Shell>
  );
}

function TaskRow({ task, expanded, onToggle }) {
  const hasSubtasks = task.subtasks?.length > 0;
  const doneSubs = task.subtasks?.filter((s) => s.isDone).length || 0;
  const estimate = minsToHuman(task.timeEstimate);
  const spent = minsToHuman(task.timeSpent);

  return (
    <div style={{ ...s.taskRow, opacity: task.isDone ? 0.5 : 1 }}>
      <div style={s.taskMain}>
        <div style={{ ...s.check, background: task.isDone ? "#4ade80" : "transparent", borderColor: task.isDone ? "#4ade80" : "#3a3a3a" }}>
          {task.isDone && <span style={{ color: "#000", fontSize: 10, fontWeight: 800 }}>✓</span>}
        </div>
        <span style={{ ...s.taskTitle, textDecoration: task.isDone ? "line-through" : "none" }}>
          {task.title}
        </span>
        <div style={s.taskMeta}>
          {estimate && <span style={s.pill}>{estimate}</span>}
          {spent && <span style={{ ...s.pill, background: "#1a2a1a", color: "#4ade80" }}>{spent} spent</span>}
          {hasSubtasks && (
            <button style={s.subBtn} onClick={onToggle}>
              {doneSubs}/{task.subtasks.length} {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>
      {expanded && hasSubtasks && (
        <div style={s.subtaskList}>
          {task.subtasks.map((sub) => (
            <div key={sub.id} style={s.subtaskRow}>
              <div style={{ ...s.check, width: 14, height: 14, background: sub.isDone ? "#4ade80" : "transparent", borderColor: sub.isDone ? "#4ade80" : "#333" }}>
                {sub.isDone && <span style={{ color: "#000", fontSize: 8, fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ ...s.taskTitle, fontSize: 12, color: "#888", textDecoration: sub.isDone ? "line-through" : "none" }}>{sub.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Step({ n, text, link }) {
  return (
    <div style={s.step}>
      <div style={s.stepN}>{n}</div>
      <div style={s.stepText}>
        {link ? <a href={link} target="_blank" rel="noreferrer" style={{ color: "#f59e0b", textDecoration: "underline" }}>{text}</a> : text}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={s.root}>
      <div style={s.bg} />
      {children}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button style={{ ...s.iconBtn, opacity: disabled ? 0.5 : 1 }} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  );
}

function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#0a0a0a}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    `}</style>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = {
  root: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", fontFamily: "'DM Mono', monospace", padding: 24, position: "relative" },
  bg: { position: "fixed", inset: 0, background: "radial-gradient(ellipse 60% 40% at 50% 0%, #1a0f0020 0%, transparent 70%)", pointerEvents: "none" },

  // Setup
  setupCard: { position: "relative", zIndex: 1, background: "#111", border: "1px solid #222", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 460, animation: "fadeUp .4s ease both" },
  logo: { fontSize: 40, marginBottom: 16 },
  title: { fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, color: "#f5f0e8", marginBottom: 8 },
  subtitle: { color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 28 },
  steps: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 },
  step: { display: "flex", gap: 12, alignItems: "flex-start" },
  stepN: { background: "#f59e0b", color: "#000", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 },
  stepText: { color: "#999", fontSize: 12, lineHeight: 1.5 },
  input: { width: "100%", background: "#0d0d0d", border: "1px solid #2a2a2a", color: "#f5f0e8", borderRadius: 10, padding: "12px 14px", fontSize: 13, fontFamily: "'DM Mono', monospace", outline: "none", marginBottom: 12 },
  connectBtn: { width: "100%", background: "#f59e0b", color: "#000", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Mono', monospace", letterSpacing: "0.04em" },
  errorMsg: { background: "#1a0808", border: "1px solid #3a1010", color: "#f87171", borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 12 },

  // Main card
  card: { position: "relative", zIndex: 1, background: "#111", border: "1px solid #1e1e1e", borderRadius: 20, padding: "28px 28px 20px", width: "100%", maxWidth: 480, animation: "fadeUp .4s ease both" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  dateStr: { color: "#555", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 },
  headline: { fontFamily: "'Fraunces', serif", fontSize: 26, color: "#f5f0e8", fontWeight: 300, fontStyle: "italic" },
  headerActions: { display: "flex", gap: 6 },
  iconBtn: { background: "#181818", border: "1px solid #2a2a2a", color: "#888", borderRadius: 9, width: 34, height: 34, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },

  // Progress
  progressArea: { marginBottom: 20 },
  progressTrack: { height: 3, background: "#1e1e1e", borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #f59e0b, #fcd34d)", borderRadius: 3, transition: "width .5s ease" },
  progressMeta: { display: "flex", justifyContent: "space-between" },
  progressLabel: { color: "#666", fontSize: 11, fontFamily: "'DM Mono', monospace" },
  syncTime: { color: "#333", fontSize: 11 },

  // Tasks
  taskList: { display: "flex", flexDirection: "column", gap: 2, minHeight: 60 },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 13, padding: "32px 0", gap: 8 },
  spinner: { width: 20, height: 20, border: "2px solid #222", borderTopColor: "#f59e0b", borderRadius: "50%", animation: "spin .8s linear infinite" },
  taskRow: { borderRadius: 10, padding: "10px 12px", transition: "background .15s", background: "#0d0d0d" },
  taskMain: { display: "flex", alignItems: "center", gap: 10 },
  check: { width: 18, height: 18, borderRadius: "50%", border: "1.5px solid", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" },
  taskTitle: { flex: 1, fontSize: 13, color: "#d4cfc8", lineHeight: 1.4 },
  taskMeta: { display: "flex", gap: 5, alignItems: "center", flexShrink: 0 },
  pill: { background: "#1a1a1a", color: "#666", fontSize: 10, padding: "2px 7px", borderRadius: 99, border: "1px solid #2a2a2a" },
  subBtn: { background: "none", border: "none", color: "#555", fontSize: 10, cursor: "pointer", fontFamily: "'DM Mono', monospace" },
  subtaskList: { paddingLeft: 28, paddingTop: 8, display: "flex", flexDirection: "column", gap: 5 },
  subtaskRow: { display: "flex", alignItems: "center", gap: 8 },

  footer: { textAlign: "center", color: "#2a2a2a", fontSize: 10, letterSpacing: "0.08em", marginTop: 20, textTransform: "uppercase" },
};

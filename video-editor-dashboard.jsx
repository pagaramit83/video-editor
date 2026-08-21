import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  LayoutDashboard, Users, Clapperboard, NotebookPen, CalendarDays, FileBarChart,
  LineChart as LineChartIcon, Settings as SettingsIcon, Plus, Search, X, Menu,
  ChevronRight, ChevronLeft, Clock, AlertTriangle, CheckCircle2, Upload, Film,
  TrendingUp, TrendingDown, Edit3, Trash2, ExternalLink, Download, Printer,
  Zap, Activity, Filter, ArrowUpRight, ArrowDownRight, Circle, MoreVertical,
} from "lucide-react";

/* ============================== CONSTANTS ============================== */

const STATUS = ["Pending","Editing","Internal Review","Sent to Client","Revision Required","Approved","Scheduled","Uploaded","Completed"];
const KANBAN_COLS = ["Pending","Editing","Internal Review","Revision Required","Approved","Uploaded"];
const PRIORITY = ["Low","Medium","High","Urgent"];
const CLIENT_STATUS = ["Active","Paused","Completed","Inactive"];
const REEL_TYPES = ["Product Reel","Promo Reel","Awareness Reel","Testimonial","Festival Reel","UGC Style","Brand Story","Other"];
const PLATFORMS = ["Instagram","YouTube","Facebook","Other"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const STATUS_COLOR = {
  "Pending": "#8A93A6",
  "Editing": "#6D5EF5",
  "Internal Review": "#4FA3E3",
  "Sent to Client": "#4FA3E3",
  "Revision Required": "#F5A623",
  "Approved": "#22D3AA",
  "Scheduled": "#22D3AA",
  "Uploaded": "#3DDC97",
  "Completed": "#3DDC97",
  "Overdue": "#F5566D",
};
const PRIORITY_COLOR = { "Low": "#8A93A6", "Medium": "#4FA3E3", "High": "#F5A623", "Urgent": "#F5566D" };

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Users },
  { id: "reels", label: "Reels / Work", icon: Clapperboard },
  { id: "dailylog", label: "Daily Work Log", icon: NotebookPen },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "analytics", label: "Analytics", icon: LineChartIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/* ============================== HELPERS ============================== */

const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const isFinishedStatus = (s) => ["Approved","Scheduled","Uploaded","Completed"].includes(s);
const isUploadedStatus = (s) => ["Uploaded","Completed"].includes(s);
const isOverdue = (reel) => reel.deadline && !isUploadedStatus(reel.status) && daysBetween(todayISO(), reel.deadline) < 0;

function clientStatsFor(clientId, reels) {
  const rs = reels.filter((r) => r.clientId === clientId);
  const total = rs.length;
  const pending = rs.filter((r) => r.status === "Pending").length;
  const editing = rs.filter((r) => r.status === "Editing").length;
  const review = rs.filter((r) => ["Internal Review","Sent to Client"].includes(r.status)).length;
  const revision = rs.filter((r) => r.status === "Revision Required").length;
  const approved = rs.filter((r) => isFinishedStatus(r.status)).length;
  const uploaded = rs.filter((r) => isUploadedStatus(r.status)).length;
  const completed = approved; // finished-editing bucket counted toward target
  const rejected = rs.filter((r) => (r.revisionCount || 0) > 0).length;
  const overdue = rs.filter(isOverdue).length;
  return { total, pending, editing, review, revision, approved, uploaded, completed, rejected, overdue, reels: rs };
}

function healthScore(client, reels) {
  const s = clientStatsFor(client.id, reels);
  const target = client.target || 1;
  const targetPct = Math.min(100, (s.completed / target) * 100);
  const overdueRatio = s.total ? s.overdue / s.total : 0;
  const revisionRatio = s.total ? s.rejected / s.total : 0;
  const score = targetPct * 0.55 + (1 - overdueRatio) * 100 * 0.25 + (1 - revisionRatio) * 100 * 0.2;
  let label = "At Risk", color = "#F5566D";
  if (score >= 85) { label = "Excellent"; color = "#3DDC97"; }
  else if (score >= 65) { label = "Healthy"; color = "#22D3AA"; }
  else if (score >= 45) { label = "Attention Needed"; color = "#F5A623"; }
  return { score: Math.round(score), label, color };
}

function performanceLabel(pct) {
  if (pct >= 90) return { label: "Excellent", color: "#3DDC97" };
  if (pct >= 75) return { label: "Good", color: "#22D3AA" };
  if (pct >= 50) return { label: "Average", color: "#F5A623" };
  return { label: "Needs Attention", color: "#F5566D" };
}

function toCSV(rows, headers) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(",")];
  rows.forEach((r) => lines.push(headers.map((h) => esc(r[h])).join(",")));
  return lines.join("\n");
}
function downloadFile(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ============================== SAMPLE DATA ============================== */

function buildSampleData() {
  const clients = [];
  const reels = [];
  const dailyLogs = [];
  const today = new Date();
  const brands = ["Studio 12 tag", "Nimbus", "Vantage", "Coral Kitchen", "Fitzone", "Aura Skincare", "Bolt Rides", "Peak Realty", "Sage Wellness", "Loop Motors"];
  const statusesCycle = ["Pending","Editing","Internal Review","Sent to Client","Revision Required","Approved","Scheduled","Uploaded","Completed"];

  for (let i = 1; i <= 10; i++) {
    const cid = uid("client");
    const target = [8,10,12,15,16,18,20,10,14,20][i-1];
    const start = new Date(today.getFullYear(), today.getMonth(), 1 + (i % 5));
    clients.push({
      id: cid,
      name: `Client 0${i}`.replace("010","10"),
      company: brands[i-1],
      contact: `Contact Person ${i}`,
      phone: `+91 90000 0${(1000+i).toString().slice(-4)}`,
      email: `client${i}@example.com`,
      target,
      startDate: start.toISOString().slice(0,10),
      endDate: "",
      notes: "Sample client generated for demo purposes.",
      status: i === 9 ? "Paused" : i === 10 ? "Inactive" : "Active",
      sample: true,
      createdAt: Date.now(),
    });

    const reelCount = Math.max(4, Math.round(target * 0.8));
    for (let j = 1; j <= reelCount; j++) {
      const assigned = new Date(today.getFullYear(), today.getMonth(), Math.max(1, (j * 2) % 26));
      const deadlineOffset = (j % 6) - 2; // some overdue, some future
      const deadline = new Date(today); deadline.setDate(today.getDate() + deadlineOffset + (j % 3));
      const status = statusesCycle[(i + j) % statusesCycle.length];
      const priority = PRIORITY[(i + j) % PRIORITY.length];
      const revisionCount = status === "Revision Required" ? 1 + (j % 2) : (status === "Completed" && j % 3 === 0 ? 1 : 0);
      reels.push({
        id: uid("reel"),
        title: `${REEL_TYPES[(i + j) % REEL_TYPES.length]} ${j}`,
        clientId: cid,
        type: REEL_TYPES[(i + j) % REEL_TYPES.length],
        assignedDate: assigned.toISOString().slice(0,10),
        deadline: deadline.toISOString().slice(0,10),
        status,
        priority,
        revisionCount,
        revisionNotes: revisionCount ? "Client requested tighter pacing and brand-color correction." : "",
        approvalDate: isFinishedStatus(status) ? deadline.toISOString().slice(0,10) : "",
        approvalTime: isFinishedStatus(status) ? "16:30" : "",
        uploadDate: isUploadedStatus(status) ? deadline.toISOString().slice(0,10) : "",
        uploadTime: isUploadedStatus(status) ? "18:00" : "",
        platform: isUploadedStatus(status) ? PLATFORMS[(i+j) % PLATFORMS.length] : "",
        uploadLink: isUploadedStatus(status) ? "https://instagram.com/reel/sample" : "",
        uploadedBy: isUploadedStatus(status) ? "Amit" : "",
        notes: "",
        videoLink: "https://drive.google.com/sample-file",
        refLink: "https://instagram.com/reel/reference",
        sample: true,
        createdAt: Date.now(),
      });
    }
  }

  // daily logs for the last 6 days
  for (let d = 0; d < 6; d++) {
    const day = new Date(today); day.setDate(today.getDate() - d);
    const dISO = day.toISOString().slice(0,10);
    const entries = 3 + (d % 4);
    for (let e = 0; e < entries; e++) {
      const client = clients[(d + e * 3) % clients.length];
      const clientReels = reels.filter(r => r.clientId === client.id);
      const reel = clientReels[(d + e) % clientReels.length];
      if (!reel) continue;
      dailyLogs.push({
        id: uid("log"),
        date: dISO,
        clientId: client.id,
        reelId: reel.id,
        workDone: ["Editing","Color Grading","Final Export","Revision","Review Prep"][(d+e) % 5],
        status: reel.status,
        timeSpent: [1,1.5,2,2.5,3][(d+e) % 5],
        notes: "",
        sample: true,
      });
    }
  }

  return { clients, reels, dailyLogs };
}

const DEFAULT_SETTINGS = {
  name: "Amit",
  company: "Freelance Video Editing",
  logo: "",
  defaultTarget: 15,
  workingDays: "Mon–Sat",
  theme: "dark",
  reportFooter: "Generated automatically from live work data.",
};

/* ============================== STORAGE ============================== */

const STORE_KEY = "vem-dashboard-state-v1";

async function loadState() {
  try {
    const res = await window.storage.get(STORE_KEY, false);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) { /* not found or error -> fresh state */ }
  return null;
}
async function saveState(state) {
  try {
    await window.storage.set(STORE_KEY, JSON.stringify(state), false);
    return true;
  } catch (e) { console.error("save failed", e); return false; }
}

/* ============================== SMALL UI PRIMITIVES ============================== */

const Card = ({ children, style, className = "" }) => (
  <div className={`rounded-2xl ${className}`} style={{ background: "var(--surface)", border: "1px solid var(--border)", ...style }}>
    {children}
  </div>
);

const Badge = ({ text, color }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
    style={{ background: `${color}1A`, color, border: `1px solid ${color}40` }}>
    <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: "inline-block" }} />
    {text}
  </span>
);

const ProgressBar = ({ pct, color = "var(--accent)", height = 8 }) => (
  <div style={{ width: "100%", height, background: "var(--track)", borderRadius: 999, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 999, transition: "width .5s ease" }} />
  </div>
);

const IconBtn = ({ icon: Icon, onClick, title, danger }) => (
  <button title={title} onClick={onClick}
    className="p-2 rounded-lg transition-colors"
    style={{ color: danger ? "#F5566D" : "var(--text-secondary)", background: "transparent" }}
    onMouseEnter={(e) => e.currentTarget.style.background = danger ? "#F5566D1A" : "var(--surface-hover)"}
    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
    <Icon size={16} />
  </button>
);

const Btn = ({ children, onClick, variant = "primary", icon: Icon, style, type = "button", disabled }) => {
  const variants = {
    primary: { background: "var(--accent)", color: "#0A0E14", border: "1px solid var(--accent)" },
    ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--border)" },
    danger: { background: "transparent", color: "#F5566D", border: "1px solid #F5566D50" },
    subtle: { background: "var(--surface-hover)", color: "var(--text)", border: "1px solid var(--border)" },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-transform active:scale-[0.97]"
      style={{ ...variants[variant], opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer", ...style }}>
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
};

const Field = ({ label, children, span }) => (
  <label className={`flex flex-col gap-1.5 ${span ? "sm:col-span-2" : ""}`}>
    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
    {children}
  </label>
);

const inputStyle = {
  background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10,
  padding: "9px 12px", color: "var(--text)", fontSize: 14, outline: "none", width: "100%",
};
const Input = (props) => <input {...props} style={{ ...inputStyle, ...props.style }} />;
const Select = (props) => <select {...props} style={{ ...inputStyle, ...props.style }}>{props.children}</select>;
const TextArea = (props) => <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: 72, ...props.style }} />;

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
    style={{ background: "#00000090", backdropFilter: "blur(2px)" }} onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()}
      className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl my-6 animate-[fadeIn_.15s_ease]`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
        <IconBtn icon={X} onClick={onClose} />
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const StatCard = ({ label, value, sub, icon: Icon, accent, progress }) => (
  <Card style={{ padding: 18 }}>
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{label}</div>
        <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>{value}</div>
      </div>
      <div className="p-2 rounded-xl" style={{ background: `${accent}1A` }}>
        <Icon size={17} style={{ color: accent }} />
      </div>
    </div>
    {sub && <div className="mt-2 text-xs flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>{sub}</div>}
    {progress !== undefined && <div className="mt-3"><ProgressBar pct={progress} color={accent} /></div>}
  </Card>
);

const Empty = ({ text, action }) => (
  <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
    <Film size={28} style={{ color: "var(--text-secondary)" }} />
    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{text}</div>
    {action}
  </div>
);

/* ============================== APP ============================== */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [reels, setReels] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [view, setView] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [globalSearch, setGlobalSearch] = useState("");

  const [clientModal, setClientModal] = useState(null); // {editing: client|null}
  const [reelModal, setReelModal] = useState(null); // {editing: reel|null, presetClientId}
  const [logModal, setLogModal] = useState(false);
  const [toast, setToast] = useState(null);

  const saveTimer = useRef(null);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      const saved = await loadState();
      if (saved) {
        setClients(saved.clients || []);
        setReels(saved.reels || []);
        setDailyLogs(saved.dailyLogs || []);
        setSettings({ ...DEFAULT_SETTINGS, ...(saved.settings || {}) });
      } else {
        const sample = buildSampleData();
        setClients(sample.clients);
        setReels(sample.reels);
        setDailyLogs(sample.dailyLogs);
        setSettings(DEFAULT_SETTINGS);
      }
      hydrated.current = true;
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState({ clients, reels, dailyLogs, settings });
    }, 400);
  }, [clients, reels, dailyLogs, settings]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  /* ---------- CRUD: Clients ---------- */
  const upsertClient = (data) => {
    setClients((prev) => {
      if (data.id) return prev.map((c) => (c.id === data.id ? { ...c, ...data } : c));
      return [...prev, { ...data, id: uid("client"), sample: false, createdAt: Date.now() }];
    });
    showToast(data.id ? "Client updated" : "Client added");
    setClientModal(null);
  };
  const deleteClient = (id) => {
    if (!confirm("Delete this client and all their reels? This cannot be undone.")) return;
    setClients((prev) => prev.filter((c) => c.id !== id));
    setReels((prev) => prev.filter((r) => r.clientId !== id));
    setDailyLogs((prev) => prev.filter((l) => l.clientId !== id));
    if (selectedClientId === id) { setSelectedClientId(null); setView("clients"); }
    showToast("Client deleted");
  };

  /* ---------- CRUD: Reels ---------- */
  const upsertReel = (data) => {
    setReels((prev) => {
      if (data.id) return prev.map((r) => (r.id === data.id ? { ...r, ...data } : r));
      return [...prev, { ...data, id: uid("reel"), sample: false, createdAt: Date.now() }];
    });
    showToast(data.id ? "Reel updated" : "Reel added");
    setReelModal(null);
  };
  const deleteReel = (id) => {
    if (!confirm("Delete this reel?")) return;
    setReels((prev) => prev.filter((r) => r.id !== id));
    showToast("Reel deleted");
  };
  const quickStatusChange = (id, status) => {
    setReels((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const patch = { status };
      if (status === "Revision Required") patch.revisionCount = (r.revisionCount || 0) + 1;
      if (isFinishedStatus(status) && !r.approvalDate) { patch.approvalDate = todayISO(); patch.approvalTime = new Date().toTimeString().slice(0,5); }
      if (isUploadedStatus(status) && !r.uploadDate) { patch.uploadDate = todayISO(); patch.uploadTime = new Date().toTimeString().slice(0,5); }
      return { ...r, ...patch };
    }));
  };

  /* ---------- CRUD: Daily Logs ---------- */
  const addLog = (data) => {
    setDailyLogs((prev) => [...prev, { ...data, id: uid("log"), sample: false }]);
    showToast("Work logged");
    setLogModal(false);
  };
  const deleteLog = (id) => setDailyLogs((prev) => prev.filter((l) => l.id !== id));

  const clientName = useCallback((id) => clients.find((c) => c.id === id)?.name || "—", [clients]);
  const clientById = useCallback((id) => clients.find((c) => c.id === id), [clients]);

  const overdueReels = useMemo(() => reels.filter(isOverdue).sort((a,b) => new Date(a.deadline) - new Date(b.deadline)), [reels]);
  const urgentReels = useMemo(() => reels.filter((r) => r.priority === "Urgent" && !isUploadedStatus(r.status)).sort((a,b) => new Date(a.deadline) - new Date(b.deadline)), [reels]);

  const recentActivity = useMemo(() => {
    const acts = [];
    reels.forEach((r) => acts.push({ t: r.createdAt || 0, text: `${clientName(r.clientId)} — "${r.title}" is ${r.status}` }));
    return acts.sort((a,b) => b.t - a.t).slice(0, 8);
  }, [reels, clientName]);

  if (loading) {
    return (
      <div style={{ ...rootVars, background: "var(--bg)", minHeight: 560 }} className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin" style={{ width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%" }} />
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading your dashboard…</div>
        </div>
      </div>
    );
  }

  const ctx = {
    clients, reels, dailyLogs, settings,
    setClientModal, setReelModal, setLogModal,
    deleteClient, deleteReel, deleteLog, quickStatusChange,
    clientName, clientById, setSelectedClientId, setView,
    overdueReels, urgentReels, recentActivity, showToast,
    globalSearch,
  };

  return (
    <div style={{ ...rootVars, background: "var(--bg)", minHeight: 640, fontFamily: "var(--font-body)" }} className="flex text-sm">
      <GlobalStyle />
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col shrink-0" style={{ width: 232, borderRight: "1px solid var(--border)", background: "var(--sidebar)" }}>
        <SidebarContent view={view} setView={(v) => { setView(v); setSelectedClientId(null); }} settings={settings} />
      </aside>

      {/* Sidebar - mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="w-64 flex flex-col" style={{ background: "var(--sidebar)", borderRight: "1px solid var(--border)" }}>
            <SidebarContent view={view} setView={(v) => { setView(v); setSelectedClientId(null); setMobileNavOpen(false); }} settings={settings} onClose={() => setMobileNavOpen(false)} />
          </div>
          <div className="flex-1" style={{ background: "#00000090" }} onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border)", background: "var(--bgTranslucent)", backdropFilter: "blur(10px)" }}>
          <button className="md:hidden" onClick={() => setMobileNavOpen(true)}><Menu size={20} style={{ color: "var(--text)" }} /></button>
          <div className="relative flex-1 max-w-md">
            <Search size={15} style={{ position: "absolute", left: 12, top: 10, color: "var(--text-secondary)" }} />
            <Input placeholder="Search clients, reels, IDs, status…" value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)} style={{ paddingLeft: 34 }} />
          </div>
          <div className="hidden sm:flex items-center gap-2 ml-auto">
            <Btn variant="ghost" icon={Plus} onClick={() => setClientModal({ editing: null })}>Client</Btn>
            <Btn variant="ghost" icon={Plus} onClick={() => setReelModal({ editing: null })}>Reel</Btn>
            <Btn variant="primary" icon={NotebookPen} onClick={() => setLogModal(true)}>Log Work</Btn>
          </div>
          <div className="sm:hidden ml-auto flex gap-2">
            <IconBtn icon={Plus} onClick={() => setReelModal({ editing: null })} title="Add reel" />
            <IconBtn icon={NotebookPen} onClick={() => setLogModal(true)} title="Log work" />
          </div>
        </div>

        <div className="p-4 md:p-6 flex-1 min-w-0">
          {globalSearch.trim() ? (
            <GlobalSearchResults query={globalSearch} {...ctx} />
          ) : (
            <>
              {view === "dashboard" && <Dashboard {...ctx} />}
              {view === "clients" && !selectedClientId && <ClientsView {...ctx} />}
              {view === "clients" && selectedClientId && <ClientDetail clientId={selectedClientId} back={() => setSelectedClientId(null)} {...ctx} />}
              {view === "reels" && <ReelsView {...ctx} />}
              {view === "dailylog" && <DailyLogView {...ctx} />}
              {view === "calendar" && <CalendarView {...ctx} />}
              {view === "reports" && <ReportsView {...ctx} />}
              {view === "analytics" && <AnalyticsView {...ctx} />}
              {view === "settings" && <SettingsView settings={settings} setSettings={setSettings} showToast={showToast} />}
            </>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex justify-around items-center py-2"
        style={{ background: "var(--sidebar)", borderTop: "1px solid var(--border)" }}>
        {NAV.slice(0, 5).map((n) => {
          const Icon = n.icon; const active = view === n.id;
          return (
            <button key={n.id} onClick={() => { setView(n.id); setSelectedClientId(null); }} className="flex flex-col items-center gap-0.5 px-2 py-1">
              <Icon size={19} style={{ color: active ? "var(--accent)" : "var(--text-secondary)" }} />
              <span style={{ fontSize: 9.5, color: active ? "var(--accent)" : "var(--text-secondary)" }}>{n.label.split(" ")[0]}</span>
            </button>
          );
        })}
        <button onClick={() => setMobileNavOpen(true)} className="flex flex-col items-center gap-0.5 px-2 py-1">
          <MoreVertical size={19} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: 9.5, color: "var(--text-secondary)" }}>More</span>
        </button>
      </div>

      {/* Modals */}
      {clientModal && (
        <ClientFormModal editing={clientModal.editing} onClose={() => setClientModal(null)} onSave={upsertClient} defaultTarget={settings.defaultTarget} />
      )}
      {reelModal && (
        <ReelFormModal editing={reelModal.editing} presetClientId={reelModal.presetClientId} clients={clients} onClose={() => setReelModal(null)} onSave={upsertReel} />
      )}
      {logModal && (
        <DailyLogFormModal clients={clients} reels={reels} onClose={() => setLogModal(false)} onSave={addLog} />
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", boxShadow: "0 8px 24px #00000060" }}>
          <CheckCircle2 size={15} style={{ color: "var(--accent-2)" }} /> {toast}
        </div>
      )}
    </div>
  );
}

const rootVars = {
  "--bg": "#0A0E14",
  "--bgTranslucent": "#0A0E14CC",
  "--sidebar": "#0B0F17",
  "--surface": "#12161F",
  "--surface-hover": "#1A2029",
  "--track": "#1C222D",
  "--border": "#1F2530",
  "--text": "#E9ECF3",
  "--text-secondary": "#8A93A6",
  "--accent": "#7C6CFB",
  "--accent-2": "#22D3AA",
  "--warning": "#F5A623",
  "--danger": "#F5566D",
  "--font-display": "'Sora', 'Inter', sans-serif",
  "--font-body": "'Inter', system-ui, sans-serif",
};

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&family=JetBrains+Mono:wght@500&display=swap');
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: #262d3a; border-radius: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      table { border-collapse: collapse; width: 100%; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(6px);} to { opacity:1; transform:translateY(0);} }
      input:focus, select:focus, textarea:focus { border-color: var(--accent) !important; }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `}</style>
  );
}

function SidebarContent({ view, setView, settings, onClose }) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>
          <Film size={17} color="#0A0E14" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm truncate" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>{settings.company || "Reel Studio"}</div>
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Work Management</div>
        </div>
        {onClose && <button className="ml-auto" onClick={onClose}><X size={18} style={{ color: "var(--text-secondary)" }} /></button>}
      </div>
      <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
        {NAV.map((n) => {
          const Icon = n.icon; const active = view === n.id;
          return (
            <button key={n.id} onClick={() => setView(n.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors"
              style={{ background: active ? "var(--accent)1A".replace("1A","20") : "transparent", color: active ? "var(--accent)" : "var(--text-secondary)" }}>
              <Icon size={17} />
              {n.label}
              {active && <ChevronRight size={14} className="ml-auto" />}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-4 mx-3 mb-3 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--accent)", color: "#0A0E14" }}>
            {(settings.name || "A")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{settings.name}</div>
            <div className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>Admin</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================== DASHBOARD ============================== */

function Dashboard(props) {
  const { clients, reels, settings, overdueReels, urgentReels, recentActivity, setClientModal, setReelModal, setLogModal, setView, setSelectedClientId, clientName } = props;
  const [range, setRange] = useState("This Month");

  const activeClients = clients.filter((c) => c.status === "Active").length;
  const monthlyTarget = clients.reduce((s, c) => s + (Number(c.target) || 0), 0);
  const completed = reels.filter((r) => isFinishedStatus(r.status)).length;
  const pending = reels.filter((r) => r.status === "Pending").length;
  const approved = reels.filter((r) => isFinishedStatus(r.status)).length;
  const rejected = reels.filter((r) => (r.revisionCount || 0) > 0).length;
  const uploaded = reels.filter((r) => isUploadedStatus(r.status)).length;
  const progressPct = monthlyTarget ? Math.round((completed / monthlyTarget) * 100) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
            {greeting}, {settings.name} <span>👋</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Here's your video editing work overview.</p>
        </div>
        <Select value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 180 }}>
          {["Today","This Week","This Month","Custom Date Range"].map((r) => <option key={r}>{r}</option>)}
        </Select>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Btn icon={Plus} onClick={() => setClientModal({ editing: null })} variant="subtle">Add Client</Btn>
        <Btn icon={Plus} onClick={() => setReelModal({ editing: null })} variant="subtle">Add Reel</Btn>
        <Btn icon={NotebookPen} onClick={() => setLogModal(true)} variant="subtle">Daily Work Entry</Btn>
        <Btn icon={FileBarChart} onClick={() => setView("reports")} variant="subtle">Generate Report</Btn>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={clients.length} icon={Users} accent="#7C6CFB" sub={<>{activeClients} active</>} />
        <StatCard label="Monthly Reel Target" value={monthlyTarget} icon={Zap} accent="#4FA3E3" />
        <StatCard label="Reels Completed" value={completed} icon={CheckCircle2} accent="#3DDC97" progress={progressPct} sub={<>{progressPct}% of target</>} />
        <StatCard label="Pending Reels" value={pending} icon={Clock} accent="#8A93A6" />
        <StatCard label="Approved Reels" value={approved} icon={CheckCircle2} accent="#22D3AA" />
        <StatCard label="Rejected / Rework" value={rejected} icon={AlertTriangle} accent="#F5A623" />
        <StatCard label="Uploaded Reels" value={uploaded} icon={Upload} accent="#3DDC97" />
        <StatCard label="Overdue" value={overdueReels.length} icon={AlertTriangle} accent="#F5566D" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card style={{ padding: 20 }} className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold" style={{ color: "var(--text)" }}>Target vs Actual</h3>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{completed} / {monthlyTarget} reels</span>
          </div>
          <ProgressBar pct={progressPct} color="var(--accent)" height={12} />
          <div className="grid grid-cols-3 gap-4 mt-5">
            <div><div className="text-xs" style={{ color: "var(--text-secondary)" }}>Target</div><div className="text-xl font-bold" style={{ color: "var(--text)" }}>{monthlyTarget}</div></div>
            <div><div className="text-xs" style={{ color: "var(--text-secondary)" }}>Actual</div><div className="text-xl font-bold" style={{ color: "var(--accent-2)" }}>{completed}</div></div>
            <div><div className="text-xs" style={{ color: "var(--text-secondary)" }}>Remaining</div><div className="text-xl font-bold" style={{ color: "var(--warning)" }}>{Math.max(0, monthlyTarget - completed)}</div></div>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--text)" }}>Urgent Work</h3>
          {urgentReels.length === 0 ? <Empty text="No urgent reels right now." /> : (
            <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
              {urgentReels.slice(0, 6).map((r) => (
                <div key={r.id} className="p-2.5 rounded-lg" style={{ background: "var(--surface-hover)" }}>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--danger)" }}><AlertTriangle size={12}/>Urgent</div>
                  <div className="text-sm font-medium mt-0.5" style={{ color: "var(--text)" }}>{clientName(r.clientId)} — {r.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Due {fmtDate(r.deadline)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card style={{ padding: 20 }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--text)" }}>Upcoming Deadlines</h3>
          <UpcomingList reels={reels} clientName={clientName} />
        </Card>
        <Card style={{ padding: 20 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold" style={{ color: "var(--text)" }}>Overdue Reels</h3>
            {overdueReels.length > 0 && <Badge text={`${overdueReels.length}`} color="#F5566D" />}
          </div>
          {overdueReels.length === 0 ? <Empty text="Nothing overdue. Great pace!" /> : (
            <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
              {overdueReels.slice(0, 6).map((r) => (
                <div key={r.id} className="p-2.5 rounded-lg" style={{ background: "var(--surface-hover)" }}>
                  <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{clientName(r.clientId)} — {r.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--danger)" }}>{Math.abs(daysBetween(todayISO(), r.deadline))} days overdue</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card style={{ padding: 20 }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--text)" }}>Recent Activity</h3>
          <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
            {recentActivity.length === 0 ? <Empty text="No recent activity yet." /> : recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <Circle size={6} style={{ marginTop: 6, color: "var(--accent)", fill: "var(--accent)" }} />
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{a.text}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function UpcomingList({ reels, clientName }) {
  const upcoming = reels.filter((r) => !isUploadedStatus(r.status) && r.deadline && daysBetween(todayISO(), r.deadline) >= 0)
    .sort((a,b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 6);
  if (!upcoming.length) return <Empty text="No upcoming deadlines." />;
  return (
    <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
      {upcoming.map((r) => (
        <div key={r.id} className="p-2.5 rounded-lg flex items-center justify-between gap-2" style={{ background: "var(--surface-hover)" }}>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{clientName(r.clientId)} — {r.title}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{fmtDate(r.deadline)}</div>
          </div>
          <Badge text={r.status} color={STATUS_COLOR[r.status]} />
        </div>
      ))}
    </div>
  );
}

/* ============================== GLOBAL SEARCH ============================== */

function GlobalSearchResults({ query, clients, reels, clientName, setSelectedClientId, setView }) {
  const q = query.toLowerCase();
  const mc = clients.filter((c) => [c.name, c.company, c.email].join(" ").toLowerCase().includes(q));
  const mr = reels.filter((r) => [r.title, r.id, r.status, r.deadline].join(" ").toLowerCase().includes(q));
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Search results for "{query}"</h2>
      <Card style={{ padding: 16 }}>
        <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Clients ({mc.length})</div>
        {mc.length === 0 ? <div className="text-xs" style={{ color: "var(--text-secondary)" }}>No matches.</div> : mc.map((c) => (
          <div key={c.id} onClick={() => { setSelectedClientId(c.id); setView("clients"); }} className="py-2 cursor-pointer text-sm" style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}>
            {c.name} <span style={{ color: "var(--text-secondary)" }}>· {c.company}</span>
          </div>
        ))}
      </Card>
      <Card style={{ padding: 16 }}>
        <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Reels ({mr.length})</div>
        {mr.length === 0 ? <div className="text-xs" style={{ color: "var(--text-secondary)" }}>No matches.</div> : mr.map((r) => (
          <div key={r.id} className="py-2 text-sm flex items-center justify-between" style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}>
            <span>{clientName(r.clientId)} — {r.title}</span>
            <Badge text={r.status} color={STATUS_COLOR[r.status]} />
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ============================== CLIENTS ============================== */

function ClientsView({ clients, reels, setClientModal, setSelectedClientId, deleteClient }) {
  const [statusFilter, setStatusFilter] = useState("All");
  const filtered = clients.filter((c) => statusFilter === "All" || c.status === statusFilter);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Clients</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{clients.length} total · manage targets, contacts and status.</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 150 }}>
            <option>All</option>{CLIENT_STATUS.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Btn icon={Plus} onClick={() => setClientModal({ editing: null })}>Add New Client</Btn>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card style={{ padding: 20 }}><Empty text="No clients yet. Add your first client to get started." action={<Btn icon={Plus} onClick={() => setClientModal({ editing: null })}>Add New Client</Btn>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const s = clientStatsFor(c.id, reels);
            const pct = c.target ? Math.round((s.completed / c.target) * 100) : 0;
            const h = healthScore(c, reels);
            return (
              <Card key={c.id} style={{ padding: 18, cursor: "pointer" }} className="hover:brightness-110 transition-all">
                <div onClick={() => setSelectedClientId(c.id)}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                        {c.name} {c.sample && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--track)", color: "var(--text-secondary)" }}>SAMPLE</span>}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{c.company}</div>
                    </div>
                    <Badge text={c.status} color={c.status === "Active" ? "#3DDC97" : c.status === "Paused" ? "#F5A623" : c.status === "Completed" ? "#4FA3E3" : "#8A93A6"} />
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
                      <span>{s.completed} / {c.target} reels</span><span>{pct}%</span>
                    </div>
                    <ProgressBar pct={pct} color={pct >= 90 ? "#3DDC97" : pct >= 50 ? "var(--accent)" : "#F5A623"} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                    {[["Pending", s.pending, "#8A93A6"], ["Approved", s.approved, "#22D3AA"], ["Uploaded", s.uploaded, "#3DDC97"], ["Rework", s.rejected, "#F5A623"]].map(([l,v,c2]) => (
                      <div key={l}>
                        <div className="text-sm font-bold" style={{ color: c2 }}>{v}</div>
                        <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <Badge text={h.label} color={h.color} />
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Since {fmtDate(c.startDate)}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-1 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <IconBtn icon={Edit3} title="Edit" onClick={() => setClientModal({ editing: c })} />
                  <IconBtn icon={Trash2} title="Delete" danger onClick={() => deleteClient(c.id)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientDetail({ clientId, back, clients, reels, setClientModal, setReelModal, deleteReel, quickStatusChange, clientById }) {
  const client = clientById(clientId);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("All");
  if (!client) return <Empty text="Client not found." />;
  const s = clientStatsFor(clientId, reels);
  const pct = client.target ? Math.round((s.completed / client.target) * 100) : 0;
  const h = healthScore(client, reels);

  const rows = s.reels.filter((r) => (statusF === "All" || r.status === statusF) && (r.title.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q)));

  return (
    <div className="flex flex-col gap-5">
      <button onClick={back} className="flex items-center gap-1 text-sm w-fit" style={{ color: "var(--text-secondary)" }}><ChevronLeft size={16}/>Back to Clients</button>

      <Card style={{ padding: 22 }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>{client.name}</h1>
              <Badge text={client.status} color={client.status === "Active" ? "#3DDC97" : "#8A93A6"} />
              <Badge text={h.label} color={h.color} />
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{client.company} · {client.contact} · {client.email} · {client.phone}</p>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" icon={Edit3} onClick={() => setClientModal({ editing: client })}>Edit Client</Btn>
            <Btn icon={Plus} onClick={() => setReelModal({ editing: null, presetClientId: clientId })}>Add Reel</Btn>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
            <span>Target: {client.target} · Completed: {s.completed} · Pending: {s.pending}</span><span>{pct}%</span>
          </div>
          <ProgressBar pct={pct} height={12} color={pct >= 90 ? "#3DDC97" : "var(--accent)"} />
        </div>
      </Card>

      <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
        {[["Total", s.total, "#7C6CFB"], ["Editing", s.editing, "#7C6CFB"], ["Review", s.review, "#4FA3E3"], ["Revision", s.revision, "#F5A623"], ["Approved", s.approved, "#22D3AA"], ["Uploaded", s.uploaded, "#3DDC97"], ["Overdue", s.overdue, "#F5566D"]].map(([l,v,c]) => (
          <Card key={l} style={{ padding: 14, textAlign: "center" }}>
            <div className="text-lg font-bold" style={{ color: c }}>{v}</div>
            <div className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>{l}</div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 18 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold" style={{ color: "var(--text)" }}>Reel List</h3>
          <div className="flex gap-2">
            <Input placeholder="Search reels…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
            <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: 150 }}>
              <option>All</option>{STATUS.map((s2) => <option key={s2}>{s2}</option>)}
            </Select>
          </div>
        </div>
        <ReelTable rows={rows} showClient={false} setReelModal={setReelModal} deleteReel={deleteReel} quickStatusChange={quickStatusChange} />
      </Card>

      {client.notes && (
        <Card style={{ padding: 18 }}>
          <div className="font-semibold text-sm mb-1" style={{ color: "var(--text)" }}>Notes</div>
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{client.notes}</div>
        </Card>
      )}
    </div>
  );
}

function ClientFormModal({ editing, onClose, onSave, defaultTarget }) {
  const [f, setF] = useState(editing || {
    name: "", company: "", contact: "", phone: "", email: "", target: defaultTarget || 10,
    startDate: todayISO(), endDate: "", notes: "", status: "Active",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError("Client name cannot be empty.");
    if (!f.target || isNaN(Number(f.target)) || Number(f.target) <= 0) return setError("Monthly target must be a positive number.");
    setError("");
    onSave({ ...f, target: Number(f.target) });
  };
  return (
    <Modal title={editing ? "Edit Client" : "Add New Client"} onClose={onClose} wide>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Client Name *"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Amit Sharma" /></Field>
        <Field label="Company / Brand Name"><Input value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="e.g. Nimbus Foods" /></Field>
        <Field label="Contact Person"><Input value={f.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Monthly Reel Target *"><Input type="number" min="1" value={f.target} onChange={(e) => set("target", e.target.value)} /></Field>
        <Field label="Start Date"><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="End Date"><Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
        <Field label="Client Status"><Select value={f.status} onChange={(e) => set("status", e.target.value)}>{CLIENT_STATUS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Notes" span><TextArea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        {error && <div className="sm:col-span-2 text-xs px-3 py-2 rounded-lg" style={{ background: "#F5566D1A", color: "#F5566D" }}>{error}</div>}
        <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit">Save Client</Btn>
        </div>
      </form>
    </Modal>
  );
}

/* ============================== REELS ============================== */

function ReelsView({ clients, reels, setReelModal, deleteReel, quickStatusChange, clientName }) {
  const [tab, setTab] = useState("table");
  const [q, setQ] = useState("");
  const [clientF, setClientF] = useState("All");
  const [statusF, setStatusF] = useState("All");
  const [priorityF, setPriorityF] = useState("All");

  const filtered = reels.filter((r) =>
    (clientF === "All" || r.clientId === clientF) &&
    (statusF === "All" || r.status === statusF) &&
    (priorityF === "All" || r.priority === priorityF) &&
    (r.title.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q) || clientName(r.clientId).toLowerCase().includes(q.toLowerCase()))
  ).sort((a,b) => new Date(a.deadline||0) - new Date(b.deadline||0));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Reels / Work</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{filtered.length} reels shown</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {["table","kanban"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className="px-3 py-2 text-xs font-semibold capitalize"
                style={{ background: tab === t ? "var(--accent)" : "transparent", color: tab === t ? "#0A0E14" : "var(--text-secondary)" }}>{t}</button>
            ))}
          </div>
          <Btn icon={Plus} onClick={() => setReelModal({ editing: null })}>Add Reel</Btn>
        </div>
      </div>

      <Card style={{ padding: 14 }}>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative"><Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-secondary)" }} /><Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 190, paddingLeft: 30 }} /></div>
          <Select value={clientF} onChange={(e) => setClientF(e.target.value)} style={{ width: 160 }}><option value="All">All Clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: 160 }}><option>All</option>{STATUS.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={priorityF} onChange={(e) => setPriorityF(e.target.value)} style={{ width: 140 }}><option>All</option>{PRIORITY.map((s) => <option key={s}>{s}</option>)}</Select>
          <Filter size={14} style={{ color: "var(--text-secondary)" }} />
        </div>
      </Card>

      {tab === "table" ? (
        <Card style={{ padding: 18 }}>
          <ReelTable rows={filtered} showClient clientName={clientName} setReelModal={setReelModal} deleteReel={deleteReel} quickStatusChange={quickStatusChange} />
        </Card>
      ) : (
        <KanbanBoard reels={filtered} clientName={clientName} quickStatusChange={quickStatusChange} setReelModal={setReelModal} />
      )}
    </div>
  );
}

function ReelTable({ rows, showClient, clientName, setReelModal, deleteReel, quickStatusChange }) {
  if (!rows.length) return <Empty text="No reels match your filters." />;
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
            <th className="pb-2 pr-4 font-medium text-xs">Reel</th>
            {showClient && <th className="pb-2 pr-4 font-medium text-xs">Client</th>}
            <th className="pb-2 pr-4 font-medium text-xs">Deadline</th>
            <th className="pb-2 pr-4 font-medium text-xs">Priority</th>
            <th className="pb-2 pr-4 font-medium text-xs">Status</th>
            <th className="pb-2 pr-4 font-medium text-xs">Revisions</th>
            <th className="pb-2 pr-4 font-medium text-xs">Links</th>
            <th className="pb-2 pr-4 font-medium text-xs"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const overdue = isOverdue(r);
            return (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="py-2.5 pr-4">
                  <div className="font-medium" style={{ color: "var(--text)" }}>{r.title}</div>
                  <div className="text-[10.5px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{r.id}</div>
                </td>
                {showClient && <td className="py-2.5 pr-4" style={{ color: "var(--text-secondary)" }}>{clientName(r.clientId)}</td>}
                <td className="py-2.5 pr-4"><span style={{ color: overdue ? "var(--danger)" : "var(--text-secondary)" }}>{fmtDate(r.deadline)}</span>{overdue && <div className="text-[10px]" style={{ color: "var(--danger)" }}>OVERDUE</div>}</td>
                <td className="py-2.5 pr-4"><Badge text={r.priority} color={PRIORITY_COLOR[r.priority]} /></td>
                <td className="py-2.5 pr-4">
                  <Select value={r.status} onChange={(e) => quickStatusChange(r.id, e.target.value)} style={{ padding: "5px 8px", fontSize: 12, width: 150 }}>
                    {STATUS.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </td>
                <td className="py-2.5 pr-4" style={{ color: "var(--text-secondary)" }}>{r.revisionCount || 0}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex gap-2">
                    {r.videoLink && <a href={r.videoLink} target="_blank" rel="noreferrer"><ExternalLink size={13} style={{ color: "var(--accent)" }} /></a>}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <div className="flex gap-1">
                    <IconBtn icon={Edit3} onClick={() => setReelModal({ editing: r })} title="Edit" />
                    <IconBtn icon={Trash2} onClick={() => deleteReel(r.id)} title="Delete" danger />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KanbanBoard({ reels, clientName, quickStatusChange, setReelModal }) {
  const [dragId, setDragId] = useState(null);
  return (
    <div className="flex gap-4 overflow-x-auto pb-3">
      {KANBAN_COLS.map((col) => {
        const items = reels.filter((r) => r.status === col);
        return (
          <div key={col} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) quickStatusChange(dragId, col); setDragId(null); }}
            className="shrink-0 w-64 rounded-2xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_COLOR[col] }} />{col}
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--track)", color: "var(--text-secondary)" }}>{items.length}</span>
            </div>
            <div className="flex flex-col gap-2 min-h-[40px]">
              {items.map((r) => {
                const overdue = isOverdue(r);
                return (
                  <div key={r.id} draggable onDragStart={() => setDragId(r.id)} onClick={() => setReelModal({ editing: r })}
                    className="p-3 rounded-xl cursor-grab active:cursor-grabbing" style={{ background: "var(--surface-hover)", border: overdue ? "1px solid #F5566D60" : "1px solid var(--border)" }}>
                    <div className="text-xs font-medium mb-1" style={{ color: "var(--text)" }}>{r.title}</div>
                    <div className="text-[10.5px] mb-2" style={{ color: "var(--text-secondary)" }}>{clientName(r.clientId)}</div>
                    <div className="flex items-center justify-between">
                      <Badge text={r.priority} color={PRIORITY_COLOR[r.priority]} />
                      <span className="text-[10px]" style={{ color: overdue ? "var(--danger)" : "var(--text-secondary)" }}>{fmtDate(r.deadline)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReelFormModal({ editing, presetClientId, clients, onClose, onSave }) {
  const [f, setF] = useState(editing || {
    title: "", clientId: presetClientId || (clients[0]?.id || ""), type: REEL_TYPES[0], assignedDate: todayISO(),
    deadline: todayISO(), priority: "Medium", status: "Pending", videoLink: "", refLink: "", notes: "",
    revisionCount: 0, revisionNotes: "", approvalDate: "", uploadDate: "", platform: "", uploadLink: "", uploadedBy: "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return setError("Reel title cannot be empty.");
    if (!f.clientId) return setError("A reel must have a client.");
    if (!f.deadline) return setError("Deadline cannot be invalid.");
    setError("");
    onSave(f);
  };
  return (
    <Modal title={editing ? "Edit Reel" : "Add Reel"} onClose={onClose} wide>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Reel Title *" span><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Product Launch Reel" /></Field>
        <Field label="Client *"><Select value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Reel Type"><Select value={f.type} onChange={(e) => set("type", e.target.value)}>{REEL_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Assigned Date"><Input type="date" value={f.assignedDate} onChange={(e) => set("assignedDate", e.target.value)} /></Field>
        <Field label="Deadline *"><Input type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={(e) => set("priority", e.target.value)}>{PRIORITY.map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Video / Drive Link"><Input value={f.videoLink} onChange={(e) => set("videoLink", e.target.value)} placeholder="https://drive.google.com/…" /></Field>
        <Field label="Reference Link"><Input value={f.refLink} onChange={(e) => set("refLink", e.target.value)} /></Field>
        {f.status === "Revision Required" && <Field label="Client Feedback / Revision Notes" span><TextArea value={f.revisionNotes} onChange={(e) => set("revisionNotes", e.target.value)} /></Field>}
        {isUploadedStatus(f.status) && (
          <>
            <Field label="Platform"><Select value={f.platform} onChange={(e) => set("platform", e.target.value)}><option value="">Select…</option>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Upload Link"><Input value={f.uploadLink} onChange={(e) => set("uploadLink", e.target.value)} /></Field>
            <Field label="Uploaded By"><Input value={f.uploadedBy} onChange={(e) => set("uploadedBy", e.target.value)} /></Field>
          </>
        )}
        <Field label="Notes" span><TextArea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        {error && <div className="sm:col-span-2 text-xs px-3 py-2 rounded-lg" style={{ background: "#F5566D1A", color: "#F5566D" }}>{error}</div>}
        <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit">Save Reel</Btn>
        </div>
      </form>
    </Modal>
  );
}

/* ============================== DAILY WORK LOG ============================== */

function DailyLogView({ dailyLogs, clients, reels, clientName, setLogModal, deleteLog }) {
  const [date, setDate] = useState(todayISO());
  const logs = dailyLogs.filter((l) => l.date === date);
  const uniqueClients = new Set(logs.map((l) => l.clientId)).size;
  const completedCt = logs.filter((l) => isFinishedStatus(l.status)).length;
  const approvedCt = logs.filter((l) => isFinishedStatus(l.status)).length;
  const revisionCt = logs.filter((l) => l.status === "Revision Required").length;
  const uploadedCt = logs.filter((l) => isUploadedStatus(l.status)).length;
  const pendingCt = logs.filter((l) => l.status === "Pending").length;
  const reelTitle = (id) => reels.find((r) => r.id === id)?.title || "—";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Daily Work Log</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Record exactly what you worked on, every day.</p>
        </div>
        <div className="flex gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
          <Btn icon={Plus} onClick={() => setLogModal(true)}>Add Entry</Btn>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[["Clients", uniqueClients, "#7C6CFB"], ["Reels Worked", logs.length, "#4FA3E3"], ["Completed", completedCt, "#3DDC97"], ["Approved", approvedCt, "#22D3AA"], ["Revision", revisionCt, "#F5A623"], ["Pending", pendingCt, "#8A93A6"]].map(([l,v,c]) => (
          <Card key={l} style={{ padding: 14, textAlign: "center" }}>
            <div className="text-lg font-bold" style={{ color: c }}>{v}</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{l}</div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 18 }}>
        <h3 className="font-semibold mb-3" style={{ color: "var(--text)" }}>Entries for {fmtDate(date)}</h3>
        {logs.length === 0 ? <Empty text="No work logged for this date yet." action={<Btn icon={Plus} onClick={() => setLogModal(true)}>Add Entry</Btn>} /> : (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
                <th className="pb-2 pr-4 font-medium text-xs">Client</th>
                <th className="pb-2 pr-4 font-medium text-xs">Reel</th>
                <th className="pb-2 pr-4 font-medium text-xs">Work Done</th>
                <th className="pb-2 pr-4 font-medium text-xs">Status</th>
                <th className="pb-2 pr-4 font-medium text-xs">Time Spent</th>
                <th className="pb-2 pr-4 font-medium text-xs">Notes</th>
                <th></th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-2.5 pr-4" style={{ color: "var(--text)" }}>{clientName(l.clientId)}</td>
                    <td className="py-2.5 pr-4" style={{ color: "var(--text-secondary)" }}>{reelTitle(l.reelId)}</td>
                    <td className="py-2.5 pr-4" style={{ color: "var(--text-secondary)" }}>{l.workDone}</td>
                    <td className="py-2.5 pr-4"><Badge text={l.status} color={STATUS_COLOR[l.status]} /></td>
                    <td className="py-2.5 pr-4" style={{ color: "var(--text-secondary)" }}>{l.timeSpent}h</td>
                    <td className="py-2.5 pr-4" style={{ color: "var(--text-secondary)" }}>{l.notes || "—"}</td>
                    <td><IconBtn icon={Trash2} danger onClick={() => deleteLog(l.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DailyLogFormModal({ clients, reels, onClose, onSave }) {
  const [f, setF] = useState({ date: todayISO(), clientId: clients[0]?.id || "", reelId: "", workDone: "Editing", status: "Editing", timeSpent: 1, notes: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const clientReels = reels.filter((r) => r.clientId === f.clientId);
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!f.clientId) return setError("Please select a client.");
    if (!f.reelId) return setError("Please select a reel.");
    setError("");
    onSave(f);
  };
  return (
    <Modal title="Daily Work Entry" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Client *"><Select value={f.clientId} onChange={(e) => { set("clientId", e.target.value); set("reelId", ""); }}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Reel *" span><Select value={f.reelId} onChange={(e) => set("reelId", e.target.value)}><option value="">Select a reel…</option>{clientReels.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select></Field>
        <Field label="Work Done"><Input value={f.workDone} onChange={(e) => set("workDone", e.target.value)} placeholder="e.g. Final Export" /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Time Spent (hours)"><Input type="number" step="0.5" min="0" value={f.timeSpent} onChange={(e) => set("timeSpent", e.target.value)} /></Field>
        <Field label="Notes" span><TextArea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        {error && <div className="sm:col-span-2 text-xs px-3 py-2 rounded-lg" style={{ background: "#F5566D1A", color: "#F5566D" }}>{error}</div>}
        <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit">Save Entry</Btn>
        </div>
      </form>
    </Modal>
  );
}

/* ============================== CALENDAR ============================== */

function CalendarView({ reels, clientName }) {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const eventsByDay = useMemo(() => {
    const map = {};
    reels.forEach((r) => {
      if (r.deadline) {
        const d = new Date(r.deadline + "T00:00:00");
        if (d.getFullYear() === year && d.getMonth() === month) {
          (map[d.getDate()] = map[d.getDate()] || []).push(r);
        }
      }
    });
    return map;
  }, [reels, year, month]);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Calendar</h1>
        <div className="flex items-center gap-2">
          <IconBtn icon={ChevronLeft} onClick={() => setCursor(new Date(year, month - 1, 1))} />
          <div className="text-sm font-semibold w-36 text-center" style={{ color: "var(--text)" }}>{MONTHS[month]} {year}</div>
          <IconBtn icon={ChevronRight} onClick={() => setCursor(new Date(year, month + 1, 1))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px]">
        {Object.entries({Pending:"#8A93A6",Editing:"#7C6CFB",Revision:"#F5A623",Approved:"#22D3AA",Uploaded:"#3DDC97",Overdue:"#F5566D"}).map(([k,c]) => (
          <div key={k} className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}><span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />{k}</div>
        ))}
      </div>

      <Card style={{ padding: 14 }}>
        <div className="grid grid-cols-7 gap-1.5 mb-2 text-center text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const evts = eventsByDay[d] || [];
            const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
            return (
              <div key={i} onClick={() => evts.length && setSelectedDay(d)}
                className="rounded-lg p-1.5 min-h-[68px] text-left"
                style={{ background: isToday ? "var(--accent)15" : "var(--surface-hover)", border: isToday ? "1px solid var(--accent)" : "1px solid var(--border)", cursor: evts.length ? "pointer" : "default" }}>
                <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--text)" }}>{d}</div>
                <div className="flex flex-col gap-0.5">
                  {evts.slice(0, 2).map((e) => (
                    <div key={e.id} className="text-[9.5px] px-1 py-0.5 rounded truncate" style={{ background: `${isOverdue(e) ? STATUS_COLOR.Overdue : STATUS_COLOR[e.status]}25`, color: isOverdue(e) ? STATUS_COLOR.Overdue : STATUS_COLOR[e.status] }}>
                      {e.title}
                    </div>
                  ))}
                  {evts.length > 2 && <div className="text-[9px]" style={{ color: "var(--text-secondary)" }}>+{evts.length - 2} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {selectedDay && (
        <Modal title={`Deadlines on ${selectedDay} ${MONTHS[month]}`} onClose={() => setSelectedDay(null)}>
          <div className="flex flex-col gap-2.5">
            {(eventsByDay[selectedDay] || []).map((r) => (
              <div key={r.id} className="p-3 rounded-lg flex items-center justify-between" style={{ background: "var(--surface-hover)" }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{clientName(r.clientId)} — {r.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{fmtDate(r.deadline)}</div>
                </div>
                <Badge text={isOverdue(r) ? "Overdue" : r.status} color={isOverdue(r) ? STATUS_COLOR.Overdue : STATUS_COLOR[r.status]} />
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================== REPORTS ============================== */

function ReportsView({ clients, reels, dailyLogs, settings, clientName }) {
  const [tab, setTab] = useState("daily");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Reports</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Professional reports generated live from your work data.</p>
      </div>
      <div className="flex rounded-xl overflow-hidden w-fit" style={{ border: "1px solid var(--border)" }}>
        {[["daily","Daily Report"],["monthly","Monthly Report"],["company","Company Submission"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2 text-xs font-semibold"
            style={{ background: tab === k ? "var(--accent)" : "transparent", color: tab === k ? "#0A0E14" : "var(--text-secondary)" }}>{l}</button>
        ))}
      </div>
      {tab === "daily" && <DailyReport {...{ clients, reels, dailyLogs, settings, clientName }} />}
      {tab === "monthly" && <MonthlyReport {...{ clients, reels, settings }} />}
      {tab === "company" && <CompanyReport {...{ clients, reels, dailyLogs, settings }} />}
    </div>
  );
}

function DailyReport({ clients, dailyLogs, settings, clientName }) {
  const [date, setDate] = useState(todayISO());
  const logs = dailyLogs.filter((l) => l.date === date);
  const totalClients = new Set(logs.map((l) => l.clientId)).size;
  const total = logs.length;
  const completed = logs.filter((l) => isFinishedStatus(l.status)).length;
  const approved = logs.filter((l) => isFinishedStatus(l.status)).length;
  const revision = logs.filter((l) => l.status === "Revision Required").length;
  const uploaded = logs.filter((l) => isUploadedStatus(l.status)).length;
  const pending = logs.filter((l) => l.status === "Pending").length;
  const byClient = {};
  logs.forEach((l) => { byClient[l.clientId] = (byClient[l.clientId] || 0) + 1; });

  const exportPdf = () => window.print();
  const exportCsv = () => {
    const csv = toCSV(logs.map((l) => ({ Date: l.date, Client: clientName(l.clientId), WorkDone: l.workDone, Status: l.status, TimeSpent: l.timeSpent, Notes: l.notes })),
      ["Date","Client","WorkDone","Status","TimeSpent","Notes"]);
    downloadFile(`daily-report-${date}.csv`, csv, "text/csv");
  };

  return (
    <Card style={{ padding: 24 }} id="printable-report">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: "var(--accent)" }}>{settings.company}</div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Daily Work Report</h2>
          <div className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Date: {fmtDate(date)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
          <Btn variant="ghost" icon={Download} onClick={exportCsv}>CSV</Btn>
          <Btn variant="ghost" icon={Printer} onClick={exportPdf}>PDF</Btn>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {[["Clients Worked", totalClients],["Reels Worked", total],["Completed", completed],["Approved", approved],["Revision", revision],["Uploaded", uploaded]].map(([l,v]) => (
          <div key={l} className="rounded-xl p-3 text-center" style={{ background: "var(--surface-hover)" }}>
            <div className="text-lg font-bold" style={{ color: "var(--text)" }}>{v}</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Client-wise Breakdown</div>
      <div className="flex flex-col gap-1.5 mb-6">
        {Object.entries(byClient).length === 0 ? <div className="text-xs" style={{ color: "var(--text-secondary)" }}>No entries for this date.</div> :
          Object.entries(byClient).map(([cid, ct]) => (
            <div key={cid} className="flex justify-between text-sm py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text)" }}>{clientName(cid)}</span><span style={{ color: "var(--text-secondary)" }}>{ct} Reel{ct > 1 ? "s" : ""}</span>
            </div>
          ))}
      </div>

      <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Entries</div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead><tr style={{ color: "var(--text-secondary)", textAlign: "left" }}><th className="pb-2 pr-4">Client</th><th className="pb-2 pr-4">Work Done</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Time</th></tr></thead>
          <tbody>{logs.map((l) => (
            <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td className="py-2 pr-4" style={{ color: "var(--text)" }}>{clientName(l.clientId)}</td>
              <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{l.workDone}</td>
              <td className="py-2 pr-4"><Badge text={l.status} color={STATUS_COLOR[l.status]} /></td>
              <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{l.timeSpent}h</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}

function MonthlyReport({ clients, reels, settings }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const rows = clients.map((c) => {
    const s = clientStatsFor(c.id, reels);
    const pct = c.target ? Math.round((s.completed / c.target) * 100) : 0;
    const perf = performanceLabel(pct);
    return { client: c, s, pct, perf };
  });
  const totals = rows.reduce((acc, r) => ({
    target: acc.target + (r.client.target || 0), completed: acc.completed + r.s.completed, approved: acc.approved + r.s.approved,
    revision: acc.revision + r.s.revision, rejected: acc.rejected + r.s.rejected, uploaded: acc.uploaded + r.s.uploaded, pending: acc.pending + r.s.pending,
  }), { target: 0, completed: 0, approved: 0, revision: 0, rejected: 0, uploaded: 0, pending: 0 });

  const exportCsv = () => {
    const data = rows.map(({ client, s, pct, perf }) => ({
      Client: client.name, Target: client.target, Completed: s.completed, Approved: s.approved, Revision: s.revision, Uploaded: s.uploaded, Pending: s.pending, CompletionPct: pct, Performance: perf.label,
    }));
    downloadFile(`monthly-report-${MONTHS[month]}-${year}.csv`, toCSV(data, ["Client","Target","Completed","Approved","Revision","Uploaded","Pending","CompletionPct","Performance"]), "text/csv");
  };

  return (
    <Card style={{ padding: 24 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: "var(--accent)" }}>{settings.company}</div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Monthly Report — {MONTHS[month]} {year}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 140 }}>{MONTHS.map((m,i) => <option key={m} value={i}>{m}</option>)}</Select>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>{[year-1,year,year+1].map((y) => <option key={y}>{y}</option>)}</Select>
          <Btn variant="ghost" icon={Download} onClick={exportCsv}>CSV</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[["Total Clients", clients.length],["Total Target", totals.target],["Completed", totals.completed],["Approved", totals.approved],["Revisions", totals.revision],["Rejected", totals.rejected],["Uploaded", totals.uploaded],["Pending", totals.pending]].map(([l,v]) => (
          <div key={l} className="rounded-xl p-3 text-center" style={{ background: "var(--surface-hover)" }}>
            <div className="text-lg font-bold" style={{ color: "var(--text)" }}>{v}</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Client Performance</div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead><tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
            {["Client","Target","Completed","Approved","Revision","Uploaded","Pending","Completion %","Performance"].map((h) => <th key={h} className="pb-2 pr-4">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(({ client, s, pct, perf }) => (
              <tr key={client.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="py-2 pr-4 font-medium" style={{ color: "var(--text)" }}>{client.name}</td>
                <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{client.target}</td>
                <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{s.completed}</td>
                <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{s.approved}</td>
                <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{s.revision}</td>
                <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{s.uploaded}</td>
                <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{s.pending}</td>
                <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{pct}%</td>
                <td className="py-2 pr-4"><Badge text={perf.label} color={perf.color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CompanyReport({ clients, reels, dailyLogs, settings }) {
  const totals = clients.reduce((acc, c) => {
    const s = clientStatsFor(c.id, reels);
    return { target: acc.target + (c.target||0), completed: acc.completed+s.completed, approved: acc.approved+s.approved, revision: acc.revision+s.revision, uploaded: acc.uploaded+s.uploaded, pending: acc.pending+s.pending };
  }, { target:0, completed:0, approved:0, revision:0, uploaded:0, pending:0 });
  const pct = totals.target ? Math.round((totals.completed/totals.target)*100) : 0;

  const bestClient = clients.map((c) => ({ c, pct: c.target ? Math.round((clientStatsFor(c.id, reels).completed / c.target) * 100) : 0 }))
    .sort((a,b) => b.pct - a.pct)[0];

  const awaitingApproval = reels.filter((r) => ["Sent to Client","Internal Review"].includes(r.status)).length;

  const observations = [
    `${pct}% of the overall monthly reel target has been completed.`,
    bestClient ? `${bestClient.c.name} has achieved ${bestClient.pct}% of its monthly target.` : null,
    `${totals.pending} reels are currently pending.`,
    `${awaitingApproval} reels are awaiting client approval.`,
    `${totals.revision} reels are presently in revision.`,
    `${totals.uploaded} reels have been uploaded so far this period.`,
  ].filter(Boolean);

  const dailyTotals = {};
  dailyLogs.forEach((l) => { dailyTotals[l.date] = (dailyTotals[l.date] || 0) + 1; });
  const dailyRows = Object.entries(dailyTotals).sort((a,b) => new Date(b[0]) - new Date(a[0])).slice(0, 10);

  const exportCsv = () => {
    const data = clients.map((c) => {
      const s = clientStatsFor(c.id, reels);
      return { Client: c.name, Target: c.target, Completed: s.completed, Approved: s.approved, Revision: s.revision, Uploaded: s.uploaded, Pending: s.pending };
    });
    downloadFile("company-submission-report.csv", toCSV(data, ["Client","Target","Completed","Approved","Revision","Uploaded","Pending"]), "text/csv");
  };

  return (
    <Card style={{ padding: 24 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: "var(--accent)" }}>{settings.company}</div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Company Submission Report</h2>
          <div className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Editor: {settings.name} · Reporting Period: {MONTHS[new Date().getMonth()]} {new Date().getFullYear()}</div>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" icon={Download} onClick={exportCsv}>Excel/CSV</Btn>
          <Btn variant="ghost" icon={Printer} onClick={() => window.print()}>Print / PDF</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[["Total Clients", clients.length],["Total Target", totals.target],["Total Completed", totals.completed],["Total Approved", totals.approved],["Total Revision", totals.revision],["Total Uploaded", totals.uploaded],["Total Pending", totals.pending],["Overall %", pct+"%"]].map(([l,v]) => (
          <div key={l} className="rounded-xl p-3 text-center" style={{ background: "var(--surface-hover)" }}>
            <div className="text-lg font-bold" style={{ color: "var(--text)" }}>{v}</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Client-wise Performance</div>
      <div className="overflow-x-auto mb-6">
        <table className="text-xs">
          <thead><tr style={{ color: "var(--text-secondary)", textAlign: "left" }}><th className="pb-2 pr-4">Client</th><th className="pb-2 pr-4">Target</th><th className="pb-2 pr-4">Completed</th><th className="pb-2 pr-4">%</th></tr></thead>
          <tbody>{clients.map((c) => {
            const s = clientStatsFor(c.id, reels); const p = c.target ? Math.round((s.completed/c.target)*100) : 0;
            return <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td className="py-2 pr-4" style={{ color: "var(--text)" }}>{c.name}</td>
              <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{c.target}</td>
              <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{s.completed}</td>
              <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{p}%</td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Daily Productivity (recent)</div>
      <div className="flex flex-col gap-1.5 mb-6">
        {dailyRows.map(([d,ct]) => (
          <div key={d} className="flex justify-between text-sm py-1" style={{ borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text)" }}>{fmtDate(d)}</span><span style={{ color: "var(--text-secondary)" }}>{ct} reels worked</span>
          </div>
        ))}
      </div>

      <div className="font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>Key Observations</div>
      <ul className="flex flex-col gap-1.5 mb-2">
        {observations.map((o, i) => (
          <li key={i} className="text-sm flex items-start gap-2" style={{ color: "var(--text-secondary)" }}>
            <ArrowUpRight size={13} style={{ marginTop: 3, color: "var(--accent)" }} />{o}
          </li>
        ))}
      </ul>
      <div className="text-[11px] mt-4 pt-4" style={{ borderTop: "1px solid var(--border)", color: "var(--text-secondary)" }}>{settings.reportFooter}</div>
    </Card>
  );
}

/* ============================== ANALYTICS ============================== */

function AnalyticsView({ clients, reels, dailyLogs }) {
  const [clientF, setClientF] = useState("All");
  const filteredReels = clientF === "All" ? reels : reels.filter((r) => r.clientId === clientF);

  const perDay = useMemo(() => {
    const map = {};
    dailyLogs.forEach((l) => { map[l.date] = (map[l.date] || 0) + 1; });
    return Object.entries(map).sort((a,b) => new Date(a[0]) - new Date(b[0])).slice(-14).map(([date, count]) => ({ date: fmtDate(date).slice(0,6), count }));
  }, [dailyLogs]);

  const perClient = clients.map((c) => ({ name: c.name, reels: filteredReels.filter((r) => r.clientId === c.id).length })).filter(d => clientF === "All" || d.reels > 0);

  const approvedVsRevision = [
    { name: "Approved", value: filteredReels.filter((r) => isFinishedStatus(r.status)).length },
    { name: "Revision", value: filteredReels.filter((r) => r.status === "Revision Required").length },
  ];
  const statusDist = STATUS.map((s) => ({ name: s, value: filteredReels.filter((r) => r.status === s).length })).filter((d) => d.value > 0);
  const PIE_COLORS = ["#7C6CFB","#4FA3E3","#22D3AA","#F5A623","#F5566D","#3DDC97","#8A93A6","#C084FC","#38BDF8"];

  const targetVsActual = clients.map((c) => { const s = clientStatsFor(c.id, reels); return { name: c.name, target: c.target, actual: s.completed }; });

  const weekMap = {};
  dailyLogs.forEach((l) => { const d = new Date(l.date); const week = `W${Math.ceil(d.getDate()/7)} ${MONTHS[d.getMonth()].slice(0,3)}`; weekMap[week] = (weekMap[week]||0)+1; });
  const perWeek = Object.entries(weekMap).map(([week, count]) => ({ week, count }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Analytics</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Visual trends across clients and work status.</p>
        </div>
        <Select value={clientF} onChange={(e) => setClientF(e.target.value)} style={{ width: 180 }}>
          <option value="All">All Clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Reels Worked Per Day (last 14 entries)">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={perDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2530" />
              <XAxis dataKey="date" tick={{ fill: "#8A93A6", fontSize: 10 }} />
              <YAxis tick={{ fill: "#8A93A6", fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke="#7C6CFB" fill="#7C6CFB33" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Reels Worked Per Week">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={perWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2530" />
              <XAxis dataKey="week" tick={{ fill: "#8A93A6", fontSize: 10 }} />
              <YAxis tick={{ fill: "#8A93A6", fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#4FA3E3" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Client-wise Reel Count">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={perClient} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2530" />
              <XAxis type="number" tick={{ fill: "#8A93A6", fontSize: 10 }} allowDecimals={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: "#8A93A6", fontSize: 10 }} width={80} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="reels" fill="#22D3AA" radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Approved vs Revision">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={approvedVsRevision} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {approvedVsRevision.map((e, i) => <Cell key={i} fill={i === 0 ? "#22D3AA" : "#F5A623"} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#8A93A6" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" nameKey="name" outerRadius={90} label={{ fontSize: 10, fill: "#8A93A6" }}>
                {statusDist.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Target vs Actual (by client)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={targetVsActual}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2530" />
              <XAxis dataKey="name" tick={{ fill: "#8A93A6", fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fill: "#8A93A6", fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#8A93A6" }} />
              <Bar dataKey="target" fill="#8A93A6" radius={[4,4,0,0]} />
              <Bar dataKey="actual" fill="#7C6CFB" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <Card style={{ padding: 18 }}>
      <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--text)" }}>{title}</h3>
      {children}
    </Card>
  );
}
const tooltipStyle = { background: "#12161F", border: "1px solid #1F2530", borderRadius: 10, fontSize: 12, color: "#E9ECF3" };

/* ============================== SETTINGS ============================== */

function SettingsView({ settings, setSettings, showToast }) {
  const [f, setF] = useState(settings);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = (e) => { e.preventDefault(); setSettings(f); showToast("Settings saved"); };
  const onLogo = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("logo", reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>Settings</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Personalize your workspace and report branding.</p>
      </div>
      <Card style={{ padding: 22 }}>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="My Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Company Name"><Input value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="Default Monthly Target"><Input type="number" value={f.defaultTarget} onChange={(e) => set("defaultTarget", Number(e.target.value))} /></Field>
          <Field label="Working Days"><Input value={f.workingDays} onChange={(e) => set("workingDays", e.target.value)} /></Field>
          <Field label="Company Logo" span>
            <div className="flex items-center gap-3">
              {f.logo && <img src={f.logo} alt="logo" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />}
              <input type="file" accept="image/*" onChange={onLogo} style={{ color: "var(--text-secondary)", fontSize: 12 }} />
            </div>
          </Field>
          <Field label="Report Footer Text" span><TextArea value={f.reportFooter} onChange={(e) => set("reportFooter", e.target.value)} /></Field>
          <div className="sm:col-span-2 flex justify-end"><Btn type="submit">Save Settings</Btn></div>
        </form>
      </Card>
      <Card style={{ padding: 22 }}>
        <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--text)" }}>About this workspace</h3>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>All data is stored securely per-user and persists automatically — clients, reels, daily logs and settings update in real time across the app with no manual saving required.</p>
      </Card>
    </div>
  );
}

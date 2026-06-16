import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth-context";
import { Loader } from "../components/ui";
import { logAction } from "../lib/audit";
import {
  ArrowLeft, Trash2, Plus, X, Check, Circle, Clock, ChevronUp, ChevronDown,
  ListChecks, CircleDollarSign, FileText, KeyRound, LayoutDashboard, Users, Send, Copy,
  RefreshCw, Eye, AlertTriangle, MessageSquare, Calendar, Link2, ExternalLink, Sparkles,
} from "lucide-react";
import {
  patchProject, removeProject, milestoneAmount, formatINR, genCode, uid, emptyForm,
  memberAccess, addStageComment, streamStageComments, removeStageComment,
  type Project, type ProjectStage, type PaymentMilestone, type RequirementField,
  type ProjectClient, type StageStatus, type ProjectStatus, type FieldType,
  type StageFeature, type StageComment, type ProjectSection,
} from "../lib/projects";

// Stage deadlines are stored as ms timestamps; the <input type=date> wants YYYY-MM-DD.
const tsToDateInput = (ts?: number | null) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");
const dateInputToTs = (v: string) => (v ? new Date(v + "T00:00:00").getTime() : null);
const fmtDeadline = (ts?: number | null) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const isStageOverdue = (s: ProjectStage) => !!s.deadline && s.status !== "done" && s.deadline < Date.now();

// Old project docs (pre-rebuild) may be missing the new fields — fill safe defaults.
function normalize(p: any): Project {
  return {
    ...p,
    status: p.status || "active",
    summary: p.summary || "",
    clients: Array.isArray(p.clients) ? p.clients : [],
    members: Array.isArray(p.members) ? p.members : [],
    stages: (Array.isArray(p.stages) ? p.stages : []).map((s: any) => ({
      ...s,
      deadline: s.deadline ?? null,
      link: s.link || "",
      features: Array.isArray(s.features) ? s.features : [],
    })),
    payment: p.payment && typeof p.payment === "object"
      ? { total: p.payment.total || 0, currency: p.payment.currency || "INR", milestones: Array.isArray(p.payment.milestones) ? p.payment.milestones : [] }
      : { total: 0, currency: "INR", milestones: [] },
    requirementForm: p.requirementForm && Array.isArray(p.requirementForm.fields) ? p.requirementForm : emptyForm(),
    portal: p.portal || null,
  };
}

const PORTAL_BASE = (import.meta.env.VITE_PORTAL_URL as string) || "https://onlylogic.netlify.app/portal";

type Tab = ProjectSection;

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "timeline", label: "Timeline", icon: ListChecks },
  { key: "payments", label: "Payments", icon: CircleDollarSign },
  { key: "requirements", label: "Requirements", icon: FileText },
  { key: "comments", label: "Feedback", icon: MessageSquare },
  { key: "access", label: "Client Access", icon: KeyRound },
];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#EDEFFF] text-[#2B41E0]",
  "on-hold": "bg-[#FFF4E5] text-[#B7791F]",
  completed: "bg-[#E6F6EF] text-[#0F9D6B]",
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, isAdmin, member, user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  // Per-project access. Admins and anyone with no explicit access entry fall
  // back to their module permission (full access). A restricted team member
  // only sees their granted sections, with read/write + payment visibility per the entry.
  const access = useMemo(() => project && !isAdmin
    ? memberAccess(project, { uid: user?.uid, email: member?.email })
    : null, [project, isAdmin, user?.uid, member?.email]);

  const modWrite = can("projects", "write");
  const canWrite = isAdmin ? true : access ? access.canWrite : modWrite;
  const hidePayments = access ? access.hidePayments : false;
  const visibleTabs = TABS.filter((t) => !access || access.sections.includes(t.key));

  // If the active tab becomes inaccessible, snap to the first allowed one.
  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((t) => t.key === tab)) setTab(visibleTabs[0].key);
  }, [visibleTabs, tab]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "projects", id), (snap) => {
      if (snap.exists()) setProject(normalize({ id: snap.id, ...snap.data() }));
      else setProject(null);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  if (loading) return <Loader label="Loading project" />;
  if (!project) return (
    <div className="font-['Poppins',sans-serif] py-20 text-center">
      <p className="text-[#13182B] font-bold text-[18px] mb-2">Project not found</p>
      <Link to="/projects" className="text-[#2B41E0] font-semibold">← Back to projects</Link>
    </div>
  );

  const save = (data: Partial<Project>) => patchProject(project.id, data);

  return (
    <div className="font-['Poppins',sans-serif]">
      <button onClick={() => navigate("/projects")} className="flex items-center gap-1.5 text-[#6B7283] hover:text-[#13182B] text-[13.5px] font-medium mb-5">
        <ArrowLeft size={16} /> All projects
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-2">
            <span className={`font-mono text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold ${STATUS_STYLES[project.status]}`}>{project.status}</span>
            <span className="font-mono text-[11px] text-[#9AA0AD]">{(project.clients || []).length} client{(project.clients || []).length === 1 ? "" : "s"}</span>
          </div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-[#13182B] leading-none tracking-tight">{project.title}</h1>
          {project.summary && <p className="text-[#6B7283] mt-2.5 text-[15px] max-w-2xl leading-relaxed">{project.summary}</p>}
        </div>
        {canWrite && (
          <button
            onClick={async () => { if (confirm(`Delete "${project.title}"? This cannot be undone.`)) { await removeProject(project.id, project.title); navigate("/projects"); } }}
            className="text-[#FF5C49] hover:bg-[#FFEDE9] px-3.5 py-2 rounded-xl text-[13.5px] font-semibold flex items-center gap-1.5 transition-colors">
            <Trash2 size={15} /> Delete
          </button>
        )}
      </div>

      {/* Summary band */}
      <ProjectSummary project={project} hidePayments={hidePayments} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#E5E2D9] mb-7 overflow-x-auto sticky top-0 bg-[#F1EFE9]/95 backdrop-blur-sm z-10">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key ? "border-[#2B41E0] text-[#2B41E0]" : "border-transparent text-[#6B7283] hover:text-[#13182B]"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab project={project} save={save} canWrite={canWrite} />}
      {tab === "timeline" && <TimelineTab project={project} save={save} canWrite={canWrite} />}
      {tab === "payments" && <PaymentsTab project={project} save={save} canWrite={canWrite} hidePayments={hidePayments} />}
      {tab === "requirements" && <RequirementsTab project={project} save={save} canWrite={canWrite} />}
      {tab === "comments" && <CommentsTab project={project} canWrite={canWrite} authorName={member?.name || member?.email || "Team"} />}
      {tab === "access" && <AccessTab project={project} save={save} canWrite={canWrite} />}
    </div>
  );
}

// A compact metric band shown under the header, across all tabs.
function ProjectSummary({ project, hidePayments }: { project: Project; hidePayments: boolean }) {
  const stages = project.stages || [];
  const done = stages.filter((s) => s.status === "done").length;
  const pct = stages.length ? Math.round((done / stages.length) * 100) : 0;
  const overdue = stages.filter(isStageOverdue).length;
  const total = project.payment?.total || 0;
  const milestones = project.payment?.milestones || [];
  const paid = milestones.filter((m) => m.status === "paid").reduce((sum, m) => sum + milestoneAmount(m, total), 0);

  const cells: { label: string; value: string; accent: string }[] = [
    { label: "Progress", value: `${pct}%`, accent: "#2B41E0" },
    { label: "Stages done", value: `${done}/${stages.length}`, accent: "#13182B" },
    { label: "Overdue", value: String(overdue), accent: overdue ? "#FF5C49" : "#9AA0AD" },
  ];
  if (!hidePayments) {
    cells.push({ label: "Contract", value: formatINR(total), accent: "#13182B" });
    cells.push({ label: "Collected", value: formatINR(paid), accent: "#0F9D6B" });
  }

  return (
    <div className="flex flex-wrap items-stretch gap-3 mb-6">
      {cells.map((c, i) => (
        <div key={i} className="bg-white border border-[#E5E2D9] rounded-2xl px-4 py-3 shadow-sm flex-1 min-w-[110px]">
          <div className="text-[20px] font-bold leading-none tracking-tight" style={{ color: c.accent }}>{c.value}</div>
          <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-[#9AA0AD] mt-1.5">{c.label}</div>
        </div>
      ))}
      <div className="basis-full h-1.5 rounded-full bg-[#E5E2D9] overflow-hidden mt-0.5">
        <div className="h-full bg-gradient-to-r from-[#2B41E0] to-[#5468F0] rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// shared input styles
const inp = "w-full px-[13px] py-[11px] rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[#13182B] text-[14px] focus:border-[#2B41E0] outline-none";
const lbl = "block font-mono text-[12px] text-[#6B7283] mb-[6px]";
const card = "bg-white border border-[#E5E2D9] rounded-[18px] p-6 shadow-sm";

// ── Overview ────────────────────────────────────────────────────────────────
function OverviewTab({ project, save, canWrite }: TabProps) {
  const [clients, setClients] = useState<ProjectClient[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) =>
      setClients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any));
    return () => unsub();
  }, []);

  const onProject = project.clients || [];
  const available = clients.filter((c) => !onProject.some((o) => o.id === c.id));

  const addClient = (c: ProjectClient) => {
    save({ clients: [...onProject, { id: c.id, name: c.name, email: c.email, company: (c as any).company === "N/A" ? "" : (c as any).company }] });
    setShowAdd(false);
  };
  const removeClient = (cid: string) => save({ clients: onProject.filter((c) => c.id !== cid) });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      <div className={`${card} lg:col-span-1`}>
        <h3 className="font-bold text-[#13182B] text-[16px] mb-4">Status</h3>
        <select disabled={!canWrite} value={project.status} onChange={(e) => save({ status: e.target.value as ProjectStatus })} className={inp}>
          <option value="active">Active</option>
          <option value="on-hold">On hold</option>
          <option value="completed">Completed</option>
        </select>
        <div className="mt-6 pt-5 border-t border-[#EEEBE3] space-y-3 text-[13.5px]">
          <Row label="Timeline stages" value={`${(project.stages || []).length}`} />
          <Row label="Contract value" value={formatINR(project.payment?.total || 0)} />
          <Row label="Requirements form" value={project.requirementForm?.sent ? (project.requirementForm?.submittedAt ? "Submitted" : "Sent") : "Draft"} />
          <Row label="Portal access" value={project.portal?.enabled ? "Enabled" : "Off"} />
        </div>
      </div>

      <div className={`${card} lg:col-span-2`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[#13182B] text-[16px] flex items-center gap-2"><Users size={17} className="text-[#2B41E0]" /> Clients on this project</h3>
          {canWrite && <button onClick={() => setShowAdd((v) => !v)} className="text-[13px] font-semibold text-[#2B41E0] flex items-center gap-1 hover:underline"><Plus size={14} /> Add</button>}
        </div>

        {showAdd && (
          <div className="border border-[#E5E2D9] rounded-xl divide-y divide-[#EEEBE3] mb-4 max-h-52 overflow-y-auto">
            {available.length === 0 && <div className="p-3.5 text-[13px] text-[#9AA0AD] text-center">No more clients to add. Create them in the CRM.</div>}
            {available.map((c) => (
              <button key={c.id} onClick={() => addClient(c)} className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[#FCFBF8] text-left">
                <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#13182B] truncate">{c.name}</span><span className="block text-[12px] text-[#9AA0AD] truncate">{c.email}</span></span>
                <Plus size={16} className="text-[#2B41E0] shrink-0" />
              </button>
            ))}
          </div>
        )}

        {onProject.length === 0 ? (
          <p className="text-[14px] text-[#9AA0AD]">No clients yet. Add the people tracking this project.</p>
        ) : (
          <div className="space-y-2.5">
            {onProject.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border border-[#E5E2D9] rounded-xl px-4 py-3 bg-[#FCFBF8]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-[#13182B] text-white flex items-center justify-center font-semibold text-[14px] shrink-0">{c.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#13182B] truncate">{c.name}{c.company ? <span className="text-[#9AA0AD] font-normal"> · {c.company}</span> : ""}</span><span className="block text-[12px] text-[#9AA0AD] truncate">{c.email}</span></span>
                </div>
                {canWrite && <button onClick={() => removeClient(c.id)} className="text-[#9AA0AD] hover:text-[#FF5C49] shrink-0"><X size={16} /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-[#6B7283]">{label}</span><span className="font-semibold text-[#13182B]">{value}</span></div>;
}

// ── Timeline (full-width, with payments woven into each stage) ────────────────
function TimelineTab({ project, save, canWrite }: TabProps) {
  const stages = project.stages || [];
  const payment = project.payment || { total: 0, currency: "INR", milestones: [] };
  const milestones = payment.milestones || [];
  const total = payment.total || 0;
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const update = (list: ProjectStage[]) => save({ stages: list });

  const add = () => {
    if (!name.trim()) return;
    update([...stages, { id: uid(), name: name.trim(), description: desc.trim(), status: stages.length === 0 ? "active" : "pending", completedAt: null }]);
    setName(""); setDesc("");
  };
  const setStatus = (sid: string, status: StageStatus) =>
    update(stages.map((s) => s.id === sid ? { ...s, status, completedAt: status === "done" ? Date.now() : null } : s));
  const edit = (sid: string, patch: Partial<ProjectStage>) => update(stages.map((s) => s.id === sid ? { ...s, ...patch } : s));
  const remove = (sid: string) => update(stages.filter((s) => s.id !== sid));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages]; [next[i], next[j]] = [next[j], next[i]]; update(next);
  };
  const editFeatures = (sid: string, features: StageFeature[]) => edit(sid, { features });
  const togglePaid = (m: PaymentMilestone) => save({ payment: { ...payment, milestones: milestones.map((x) => x.id === m.id ? (x.status === "paid" ? { ...x, status: "due", paidAt: null } : { ...x, status: "paid", paidAt: Date.now() }) : x) } });

  const done = stages.filter((s) => s.status === "done").length;
  const pct = stages.length ? Math.round((done / stages.length) * 100) : 0;
  const paid = milestones.filter((m) => m.status === "paid").reduce((sum, m) => sum + milestoneAmount(m, total), 0);
  const scheduledOnStages = milestones.filter((m) => m.stageId).length;

  return (
    <div className="animate-fade-in grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
      {/* LEFT — the timeline rail */}
      <div>
        {/* Progress band */}
        <div className="bg-white border border-[#E5E2D9] rounded-[18px] p-5 shadow-sm mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-[#13182B] text-[16px]">Build timeline</h3>
            <span className="font-mono text-[12px] text-[#13182B] font-semibold">{done}/{stages.length} done · {pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#E5E2D9] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#2B41E0] to-[#5468F0] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[13px] text-[#6B7283] mt-3">Each stage shows its <strong className="text-[#13182B]">deadline</strong>, a client <strong className="text-[#13182B]">link</strong>, the <strong className="text-[#13182B]">features</strong> shipped, and any <strong className="text-[#13182B]">payments</strong> due at that point — exactly as the client sees it.</p>
        </div>

        {stages.length === 0 ? (
          <div className="border-2 border-dashed border-[#D7D3C7] rounded-2xl p-10 text-center text-[#9AA0AD] text-[14px]">No stages yet. Add your first one from the panel{canWrite ? "" : " (read-only)"} on the right.</div>
        ) : (
          <div className="relative">
            {stages.map((s, i) => {
              const overdue = isStageOverdue(s);
              const last = i === stages.length - 1;
              const stagePays = milestones.filter((m) => m.stageId === s.id);
              return (
                <div key={s.id} className="relative flex gap-4 pb-4">
                  {!last && <span className="absolute left-[17px] top-11 bottom-0 w-0.5 bg-[#E5E2D9]" />}
                  <div className="relative z-10 shrink-0"><StageDot status={s.status} /></div>

                  <div className="flex-1 min-w-0 bg-white border border-[#E5E2D9] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {canWrite ? (
                          <>
                            <input value={s.name} onChange={(e) => edit(s.id, { name: e.target.value })} className="w-full font-bold text-[16.5px] text-[#13182B] bg-transparent outline-none border-b border-transparent focus:border-[#E5E2D9] pb-0.5" />
                            <input value={s.description || ""} onChange={(e) => edit(s.id, { description: e.target.value })} placeholder="Add a short description…" className="w-full text-[13.5px] text-[#6B7283] bg-transparent outline-none mt-1.5" />
                          </>
                        ) : (
                          <><div className="font-bold text-[16.5px] text-[#13182B]">{s.name}</div>{s.description && <div className="text-[13.5px] text-[#6B7283] mt-1.5">{s.description}</div>}</>
                        )}
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button disabled={i === 0} onClick={() => move(i, -1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30 p-0.5"><ChevronUp size={16} /></button>
                          <button disabled={last} onClick={() => move(i, 1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30 p-0.5"><ChevronDown size={16} /></button>
                          <select value={s.status} onChange={(e) => setStatus(s.id, e.target.value as StageStatus)} className="text-[12px] font-semibold rounded-lg border border-[#D7D3C7] bg-[#FCFBF8] px-2 py-1.5 outline-none focus:border-[#2B41E0] ml-1">
                            <option value="pending">Pending</option>
                            <option value="active">Active</option>
                            <option value="done">Done</option>
                          </select>
                          <button onClick={() => remove(s.id)} className="text-[#9AA0AD] hover:text-[#FF5C49] p-1"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </div>

                    {/* Deadline + link */}
                    <div className="flex flex-wrap items-center gap-2.5 mt-3.5">
                      <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${overdue ? "border-[#FF5C49]/40 bg-[#FFEDE9]" : "border-[#E5E2D9] bg-[#FCFBF8]"}`}>
                        <Calendar size={13} className={overdue ? "text-[#FF5C49]" : "text-[#9AA0AD]"} />
                        {canWrite ? (
                          <input type="date" value={tsToDateInput(s.deadline)} onChange={(e) => edit(s.id, { deadline: dateInputToTs(e.target.value) })} className={`text-[12.5px] bg-transparent outline-none ${overdue ? "text-[#FF5C49] font-semibold" : "text-[#13182B]"}`} />
                        ) : (
                          <span className={`text-[12.5px] ${overdue ? "text-[#FF5C49] font-semibold" : "text-[#13182B]"}`}>{s.deadline ? fmtDeadline(s.deadline) : "No deadline"}</span>
                        )}
                        {overdue && <span className="text-[10px] font-mono uppercase tracking-wide text-[#FF5C49] font-bold ml-0.5">Overdue</span>}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg border border-[#E5E2D9] bg-[#FCFBF8] px-2.5 py-1.5 flex-1 min-w-[200px]">
                        <Link2 size={13} className="text-[#9AA0AD] shrink-0" />
                        {canWrite ? (
                          <input value={s.link || ""} onChange={(e) => edit(s.id, { link: e.target.value })} placeholder="Live / preview link (https://…)" className="text-[12.5px] bg-transparent outline-none w-full text-[#13182B]" />
                        ) : s.link ? (
                          <a href={s.link} target="_blank" rel="noreferrer" className="text-[12.5px] text-[#2B41E0] font-semibold truncate flex items-center gap-1">{s.link} <ExternalLink size={11} /></a>
                        ) : <span className="text-[12.5px] text-[#9AA0AD]">No link</span>}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 mt-1">
                      {/* Features */}
                      <FeatureList features={s.features || []} canWrite={canWrite} onChange={(f) => editFeatures(s.id, f)} />

                      {/* Payments due at this stage */}
                      {stagePays.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#EEEBE3]">
                          <div className="flex items-center gap-1.5 mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#9AA0AD]"><CircleDollarSign size={12} /> Payments</div>
                          <div className="space-y-1.5">
                            {stagePays.map((m) => {
                              const isPaid = m.status === "paid";
                              return (
                                <div key={m.id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${isPaid ? "border-[#0F9D6B]/25 bg-[#F6FBF8]" : "border-[#FF5C49]/25 bg-[#FFF8F6]"}`}>
                                  <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-[#13182B] truncate">{m.label}</div>
                                    <div className="font-mono text-[10.5px] text-[#9AA0AD]">{m.kind === "percent" ? `${m.value}% of total` : "Fixed"}</div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[13.5px] font-bold text-[#13182B]">{formatINR(milestoneAmount(m, total))}</span>
                                    {canWrite ? (
                                      <button onClick={() => togglePaid(m)} className={`text-[11px] font-semibold rounded-md px-2 py-1 border ${isPaid ? "bg-[#E6F6EF] text-[#0F9D6B] border-[#0F9D6B]/30" : "bg-white text-[#B7791F] border-[#D7D3C7] hover:border-[#13182B]"}`}>{isPaid ? "✓ Paid" : "Due"}</button>
                                    ) : (
                                      <span className={`text-[11px] font-semibold ${isPaid ? "text-[#0F9D6B]" : "text-[#B7791F]"}`}>{isPaid ? "Paid" : "Due"}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT — sticky controls + summary */}
      <div className="space-y-5 xl:sticky xl:top-2">
        {canWrite && (
          <div className={card}>
            <h3 className="font-bold text-[#13182B] text-[15px] mb-3">Add a stage</h3>
            <div className="grid gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Stage name — e.g. Design" className={inp} />
              <input value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Description (optional)" className={inp} />
              <button onClick={add} disabled={!name.trim()} className="bg-[#13182B] text-white px-5 py-2.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"><Plus size={16} /> Add stage</button>
            </div>
          </div>
        )}

        <div className={card}>
          <h3 className="font-bold text-[#13182B] text-[15px] mb-4">At a glance</h3>
          <div className="space-y-3">
            <Metric label="Stages complete" value={`${done} / ${stages.length}`} accent="#2B41E0" />
            <Metric label="Payments on timeline" value={`${scheduledOnStages}`} accent="#13182B" />
            <Metric label="Collected" value={formatINR(paid)} accent="#0F9D6B" />
          </div>
          <p className="text-[12px] text-[#9AA0AD] mt-4 leading-relaxed">Tie payments to stages on the <strong className="text-[#2B41E0]">Payments</strong> tab — they'll appear inline here.</p>
        </div>
      </div>
    </div>
  );
}

// Editable checklist of stage features (shown to the client in their portal).
function FeatureList({ features, canWrite, onChange }: { features: StageFeature[]; canWrite: boolean; onChange: (f: StageFeature[]) => void }) {
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; onChange([...features, { id: uid(), text: text.trim(), done: false }]); setText(""); };
  const toggle = (fid: string) => onChange(features.map((f) => f.id === fid ? { ...f, done: !f.done } : f));
  const remove = (fid: string) => onChange(features.filter((f) => f.id !== fid));

  if (!canWrite && features.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-[#EEEBE3]">
      <div className="flex items-center gap-1.5 mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#9AA0AD]"><Sparkles size={12} /> Features</div>
      <div className="space-y-1.5">
        {features.map((f) => (
          <div key={f.id} className="flex items-center gap-2 group">
            <button disabled={!canWrite} onClick={() => toggle(f.id)} className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${f.done ? "bg-[#0F9D6B] border-[#0F9D6B]" : "border-[#D7D3C7] bg-white"}`}>
              {f.done && <Check size={11} className="text-white" strokeWidth={3} />}
            </button>
            <span className={`text-[13px] flex-1 ${f.done ? "text-[#9AA0AD] line-through" : "text-[#13182B]"}`}>{f.text}</span>
            {canWrite && <button onClick={() => remove(f.id)} className="text-[#D7D3C7] hover:text-[#FF5C49] opacity-0 group-hover:opacity-100"><X size={13} /></button>}
          </div>
        ))}
      </div>
      {canWrite && (
        <div className="flex items-center gap-2 mt-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Add a feature…" className="flex-1 text-[13px] bg-[#FCFBF8] border border-[#E5E2D9] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#2B41E0]" />
          <button onClick={add} disabled={!text.trim()} className="text-[#2B41E0] disabled:opacity-40 p-1"><Plus size={16} /></button>
        </div>
      )}
    </div>
  );
}

function StageDot({ status }: { status: StageStatus }) {
  if (status === "done") return <span className="w-7 h-7 rounded-full bg-[#E6F6EF] text-[#0F9D6B] flex items-center justify-center shrink-0 mt-0.5"><Check size={15} strokeWidth={3} /></span>;
  if (status === "active") return <span className="w-7 h-7 rounded-full bg-[#EDEFFF] text-[#2B41E0] flex items-center justify-center shrink-0 mt-0.5"><Clock size={15} /></span>;
  return <span className="w-7 h-7 rounded-full bg-[#F4F2EC] text-[#B6B2A6] flex items-center justify-center shrink-0 mt-0.5"><Circle size={13} /></span>;
}

// ── Payments ────────────────────────────────────────────────────────────────
function PaymentsTab({ project, save, canWrite, hidePayments }: TabProps & { hidePayments?: boolean }) {
  const payment = project.payment || { total: 0, currency: "INR", milestones: [] };
  // When amounts are hidden for this member, show only Paid/Due status.
  const money = (n: number) => hidePayments ? "•••" : formatINR(n);
  const stages = project.stages || [];
  const [totalInput, setTotalInput] = useState(String(payment.total || ""));
  useEffect(() => { setTotalInput(String(payment.total || "")); }, [payment.total]);

  const total = payment.total || 0;
  const milestones = payment.milestones || [];

  const saveMilestones = (list: PaymentMilestone[]) => save({ payment: { ...payment, milestones: list } });
  const saveTotal = () => save({ payment: { ...payment, total: Math.max(0, Math.round(Number(totalInput) || 0)) } });

  const addMilestone = () => saveMilestones([...milestones, { id: uid(), label: `Payment ${milestones.length + 1}`, stageId: null, kind: "percent", value: 0, status: "due", paidAt: null, razorpayPaymentId: null }]);
  const editM = (mid: string, patch: Partial<PaymentMilestone>) => saveMilestones(milestones.map((m) => m.id === mid ? { ...m, ...patch } : m));
  const removeM = (mid: string) => saveMilestones(milestones.filter((m) => m.id !== mid));
  const togglePaid = (m: PaymentMilestone) => editM(m.id, m.status === "paid" ? { status: "due", paidAt: null } : { status: "paid", paidAt: Date.now() });

  const allocated = milestones.reduce((sum, m) => sum + milestoneAmount(m, total), 0);
  const paid = milestones.filter((m) => m.status === "paid").reduce((sum, m) => sum + milestoneAmount(m, total), 0);
  const overAllocated = allocated > total && total > 0;

  const paidCount = milestones.filter((m) => m.status === "paid").length;
  const showAmounts = !hidePayments;

  return (
    <div className="animate-fade-in grid grid-cols-1 xl:grid-cols-[350px_minmax(0,1fr)] gap-6 items-start">
      <div className="xl:sticky xl:top-2"><div className={card}>
        {showAmounts ? (
          <>
            <label className={lbl}>Total contract value (₹)</label>
            <div className="flex gap-3">
              <input type="number" min={0} value={totalInput} disabled={!canWrite} onChange={(e) => setTotalInput(e.target.value)} onBlur={saveTotal} placeholder="e.g. 150000" className={inp} />
              {canWrite && <button onClick={saveTotal} className="bg-[#13182B] text-white px-5 rounded-xl font-semibold text-[14px] shrink-0">Set</button>}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-5">
              <Metric label="Total" value={formatINR(total)} accent="#13182B" />
              <Metric label="Scheduled" value={formatINR(allocated)} accent={overAllocated ? "#FF5C49" : "#2B41E0"} />
              <Metric label="Paid" value={formatINR(paid)} accent="#0F9D6B" />
            </div>
            {overAllocated && (
              <div className="mt-3 flex items-center gap-2 text-[12.5px] text-[#FF5C49] font-medium"><AlertTriangle size={14} /> Scheduled payments exceed the total by {formatINR(allocated - total)}.</div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Payments cleared" value={`${paidCount} / ${milestones.length}`} accent="#0F9D6B" />
            <Metric label="Outstanding" value={`${milestones.length - paidCount}`} accent="#B7791F" />
          </div>
        )}
      </div></div>

      <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-[#13182B] text-[16px]">Payment schedule</h3>
        {canWrite && <button onClick={addMilestone} className="text-[13px] font-semibold text-[#2B41E0] flex items-center gap-1 hover:underline"><Plus size={14} /> Add payment</button>}
      </div>

      <div className="space-y-3">
        {milestones.length === 0 && <div className="border-2 border-dashed border-[#D7D3C7] rounded-2xl p-8 text-center text-[#9AA0AD] text-[14px]">No payments scheduled. Add milestones tied to your timeline stages.</div>}
        {milestones.map((m) => (
          <div key={m.id} className="bg-white border border-[#E5E2D9] rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              {canWrite ? (
                <input value={m.label} onChange={(e) => editM(m.id, { label: e.target.value })} className="font-semibold text-[15px] text-[#13182B] bg-transparent outline-none flex-1 border-b border-transparent focus:border-[#E5E2D9] pb-0.5" />
              ) : <div className="font-semibold text-[15px] text-[#13182B]">{m.label}</div>}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-[15px] text-[#13182B]">{money(milestoneAmount(m, total))}</span>
                {canWrite && showAmounts && <button onClick={() => removeM(m.id)} className="text-[#9AA0AD] hover:text-[#FF5C49]"><Trash2 size={15} /></button>}
              </div>
            </div>

            {canWrite && showAmounts ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-end">
                <div>
                  <label className="block font-mono text-[10.5px] text-[#9AA0AD] mb-1">Type</label>
                  <select value={m.kind} onChange={(e) => editM(m.id, { kind: e.target.value as any })} className="w-full text-[13px] rounded-lg border border-[#D7D3C7] bg-[#FCFBF8] px-2.5 py-2 outline-none focus:border-[#2B41E0]">
                    <option value="percent">% of total</option>
                    <option value="fixed">Fixed ₹</option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10.5px] text-[#9AA0AD] mb-1">{m.kind === "percent" ? "Percent" : "Amount"}</label>
                  <input type="number" min={0} value={m.value || ""} onChange={(e) => editM(m.id, { value: Math.max(0, Number(e.target.value) || 0) })} className="w-full text-[13px] rounded-lg border border-[#D7D3C7] bg-[#FCFBF8] px-2.5 py-2 outline-none focus:border-[#2B41E0]" />
                </div>
                <div>
                  <label className="block font-mono text-[10.5px] text-[#9AA0AD] mb-1">Linked stage</label>
                  <select value={m.stageId || ""} onChange={(e) => editM(m.id, { stageId: e.target.value || null })} className="w-full text-[13px] rounded-lg border border-[#D7D3C7] bg-[#FCFBF8] px-2.5 py-2 outline-none focus:border-[#2B41E0]">
                    <option value="">— none —</option>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button onClick={() => togglePaid(m)} className={`text-[13px] font-semibold rounded-lg px-3 py-2 border transition-colors ${m.status === "paid" ? "bg-[#E6F6EF] text-[#0F9D6B] border-[#0F9D6B]/30" : "bg-[#FCFBF8] text-[#6B7283] border-[#D7D3C7] hover:border-[#13182B]"}`}>
                  {m.status === "paid" ? "✓ Paid" : "Mark paid"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-[13px] text-[#6B7283]">
                {showAmounts && <span>{m.kind === "percent" ? `${m.value}% of total` : "Fixed"}</span>}
                {m.stageId && <span>· {stages.find((s) => s.id === m.stageId)?.name}</span>}
                <span className={`font-semibold ${m.status === "paid" ? "text-[#0F9D6B]" : "text-[#B7791F]"}`}>{m.status === "paid" ? "Paid" : "Due"}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="border border-[#E5E2D9] rounded-xl px-3.5 py-3 bg-[#FCFBF8]">
      <div className="text-[18px] font-bold leading-none" style={{ color: accent }}>{value}</div>
      <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-[#9AA0AD] mt-1.5">{label}</div>
    </div>
  );
}

// ── Requirements form builder ─────────────────────────────────────────────────
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Paragraph" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Yes / No" },
];

function RequirementsTab({ project, save, canWrite }: TabProps) {
  const form = project.requirementForm;
  const fields = form.fields || [];
  const [previewResponses, setPreviewResponses] = useState(false);

  const updateForm = (patch: Partial<typeof form>) => save({ requirementForm: { ...form, ...patch } });
  const updateFields = (list: RequirementField[]) => updateForm({ fields: list });

  const addField = () => updateFields([...fields, { id: uid(), label: "New field", type: "text", required: false, placeholder: "", options: [] }]);
  const editField = (fid: string, patch: Partial<RequirementField>) => updateFields(fields.map((f) => f.id === fid ? { ...f, ...patch } : f));
  const removeField = (fid: string) => updateFields(fields.filter((f) => f.id !== fid));
  const moveField = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= fields.length) return;
    const next = [...fields]; [next[i], next[j]] = [next[j], next[i]]; updateFields(next);
  };

  const send = async () => { await save({ requirementForm: { ...form, sent: true, sentAt: Date.now() } }); await logAction("Sent requirements form", project.title); };
  const unsend = () => updateForm({ sent: false });

  const hasResponse = !!form.submittedAt;

  return (
    <div className="animate-fade-in">
      <div className={`${card} mb-5`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-bold text-[#13182B] text-[16px]">Requirements form</h3>
            <p className="text-[13.5px] text-[#6B7283] mt-1">
              {hasResponse ? "Your client submitted their requirements." : form.sent ? "Sent — visible in the client's portal, awaiting their response." : "Draft — build the form, then send it to the client's portal."}
            </p>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2 shrink-0">
              {hasResponse && <button onClick={() => setPreviewResponses((v) => !v)} className="text-[13px] font-semibold text-[#2B41E0] flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-[#EDEFFF]"><Eye size={15} /> {previewResponses ? "Edit form" : "View responses"}</button>}
              {form.sent ? (
                <button onClick={unsend} className="text-[13px] font-semibold text-[#6B7283] flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#D7D3C7] hover:bg-[#F4F2EC]"><RefreshCw size={14} /> Unsend</button>
              ) : (
                <button onClick={send} disabled={fields.length === 0} className="text-[13.5px] font-semibold text-white bg-[#13182B] flex items-center gap-1.5 px-4 py-2 rounded-xl shadow-md disabled:opacity-50"><Send size={15} /> Send to client</button>
              )}
            </div>
          )}
        </div>
      </div>

      {previewResponses && hasResponse ? (
        <div className={card}>
          <h3 className="font-bold text-[#13182B] text-[15px] mb-4">Client responses</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.id}>
                <div className="font-mono text-[12px] text-[#6B7283] mb-1">{f.label}</div>
                <div className="text-[14px] text-[#13182B] bg-[#FCFBF8] border border-[#E5E2D9] rounded-lg px-3.5 py-2.5 whitespace-pre-wrap">{form.responses?.[f.id] || <span className="text-[#9AA0AD]">—</span>}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className={`${card} mb-4`}>
            <label className={lbl}>Form title</label>
            <input value={form.title} disabled={!canWrite} onChange={(e) => updateForm({ title: e.target.value })} className={`${inp} mb-3`} />
            <label className={lbl}>Intro text</label>
            <textarea value={form.intro || ""} disabled={!canWrite} onChange={(e) => updateForm({ intro: e.target.value })} rows={2} className={`${inp} resize-none`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {fields.map((f, i) => (
              <div key={f.id} className="bg-white border border-[#E5E2D9] rounded-2xl p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center gap-1 pt-1.5">
                    <button disabled={!canWrite || i === 0} onClick={() => moveField(i, -1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30"><ChevronUp size={15} /></button>
                    <button disabled={!canWrite || i === fields.length - 1} onClick={() => moveField(i, 1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30"><ChevronDown size={15} /></button>
                  </div>
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-mono text-[10.5px] text-[#9AA0AD] mb-1">Label</label>
                      <input value={f.label} disabled={!canWrite} onChange={(e) => editField(f.id, { label: e.target.value })} className={inp} />
                    </div>
                    <div>
                      <label className="block font-mono text-[10.5px] text-[#9AA0AD] mb-1">Type</label>
                      <select value={f.type} disabled={!canWrite} onChange={(e) => editField(f.id, { type: e.target.value as FieldType })} className={inp}>
                        {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {f.type === "select" && (
                      <div className="md:col-span-2">
                        <label className="block font-mono text-[10.5px] text-[#9AA0AD] mb-1">Options (comma separated)</label>
                        <input value={(f.options || []).join(", ")} disabled={!canWrite} onChange={(e) => editField(f.id, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} placeholder="Option A, Option B, Option C" className={inp} />
                      </div>
                    )}
                    {(f.type === "text" || f.type === "textarea" || f.type === "number") && (
                      <div className="md:col-span-2">
                        <label className="block font-mono text-[10.5px] text-[#9AA0AD] mb-1">Placeholder</label>
                        <input value={f.placeholder || ""} disabled={!canWrite} onChange={(e) => editField(f.id, { placeholder: e.target.value })} className={inp} />
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button onClick={() => removeField(f.id)} className="text-[#9AA0AD] hover:text-[#FF5C49]"><Trash2 size={15} /></button>
                      <label className="flex items-center gap-1.5 text-[11.5px] text-[#6B7283] cursor-pointer mt-auto">
                        <input type="checkbox" checked={f.required} onChange={(e) => editField(f.id, { required: e.target.checked })} className="accent-[#2B41E0]" /> Required
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {canWrite && <button onClick={addField} className="mt-4 w-full border-2 border-dashed border-[#D7D3C7] rounded-2xl py-3.5 text-[14px] font-semibold text-[#6B7283] hover:border-[#2B41E0] hover:text-[#2B41E0] transition-colors flex items-center justify-center gap-2"><Plus size={16} /> Add field</button>}
        </>
      )}
    </div>
  );
}

// ── Client access ─────────────────────────────────────────────────────────────
function AccessTab({ project, save, canWrite }: TabProps) {
  const portal = project.portal;
  const clients = project.clients || [];
  const [copied, setCopied] = useState("");

  const generate = (email: string) => save({ portal: { email: email.trim().toLowerCase(), code: genCode(), enabled: true } });
  const regenerate = () => portal && save({ portal: { ...portal, code: genCode() } });
  const toggle = () => portal && save({ portal: { ...portal, enabled: !portal.enabled } });

  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); };

  // The link carries the project id so the client portal can read this one
  // project by id (matching the Firestore rules) without a collection query.
  const portalUrl = `${PORTAL_BASE}?p=${project.id}`;

  if (clients.length === 0) {
    return <div className="max-w-3xl animate-fade-in border-2 border-dashed border-[#D7D3C7] rounded-2xl p-8 text-center text-[#9AA0AD] text-[14px]">Add a client on the Overview tab first — portal access is granted to a client's email.</div>;
  }

  return (
    <div className="animate-fade-in">
      {!portal ? (
        <div className={card}>
          <h3 className="font-bold text-[#13182B] text-[16px] mb-1.5">Grant portal access</h3>
          <p className="text-[13.5px] text-[#6B7283] mb-4">Pick the client who'll log in. We'll generate an access code you hand to them.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {clients.map((c) => (
              <button key={c.id} disabled={!canWrite} onClick={() => generate(c.email)} className="w-full flex items-center justify-between border border-[#E5E2D9] rounded-xl px-4 py-3 bg-[#FCFBF8] hover:border-[#2B41E0] text-left disabled:opacity-60">
                <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#13182B] truncate">{c.name}</span><span className="block text-[12px] text-[#9AA0AD] truncate">{c.email}</span></span>
                <span className="text-[13px] font-semibold text-[#2B41E0] flex items-center gap-1 shrink-0"><KeyRound size={14} /> Grant</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className={card}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[#13182B] text-[16px]">Portal credentials</h3>
              <span className={`font-mono text-[11px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold ${portal.enabled ? "bg-[#E6F6EF] text-[#0F9D6B]" : "bg-[#F4F2EC] text-[#6B7283]"}`}>{portal.enabled ? "Enabled" : "Disabled"}</span>
            </div>

            <div className="space-y-3">
              <Credential label="Portal link" value={portalUrl} onCopy={() => copy(portalUrl, "url")} copied={copied === "url"} />
              <Credential label="Login email" value={portal.email} onCopy={() => copy(portal.email, "email")} copied={copied === "email"} />
              <Credential label="Access code" value={portal.code} mono onCopy={() => copy(portal.code, "code")} copied={copied === "code"} />
            </div>

            {canWrite && (
              <div className="flex flex-wrap gap-2.5 mt-5 pt-5 border-t border-[#EEEBE3]">
                <button onClick={() => copy(`Portal: ${portalUrl}\nEmail: ${portal.email}\nAccess code: ${portal.code}`, "all")} className="bg-[#13182B] text-white px-4 py-2.5 rounded-xl font-semibold text-[13.5px] flex items-center gap-2"><Copy size={15} /> {copied === "all" ? "Copied!" : "Copy all credentials"}</button>
                <button onClick={regenerate} className="border border-[#D7D3C7] text-[#6B7283] px-4 py-2.5 rounded-xl font-semibold text-[13.5px] flex items-center gap-2 hover:bg-[#F4F2EC]"><RefreshCw size={14} /> New code</button>
                <button onClick={toggle} className={`px-4 py-2.5 rounded-xl font-semibold text-[13.5px] ${portal.enabled ? "text-[#FF5C49] hover:bg-[#FFEDE9]" : "text-[#0F9D6B] hover:bg-[#E6F6EF]"}`}>{portal.enabled ? "Disable access" : "Enable access"}</button>
              </div>
            )}
          </div>

          {/* How the client gets in */}
          <div className={card}>
            <h3 className="font-bold text-[#13182B] text-[16px] mb-1.5 flex items-center gap-2"><KeyRound size={17} className="text-[#2B41E0]" /> How your client signs in</h3>
            <p className="text-[13.5px] text-[#6B7283] mb-4">Share the three credentials on the left — here's what happens on their end.</p>
            <ol className="space-y-3">
              {[
                "They open the portal link you send them.",
                "They enter their email and the access code.",
                "They land on a live view of this project — timeline, deadlines, features and payments.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#EDEFFF] text-[#2B41E0] flex items-center justify-center font-bold text-[12px] shrink-0">{i + 1}</span>
                  <span className="text-[13.5px] text-[#3A4257] leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 pt-4 border-t border-[#EEEBE3] flex items-start gap-2 text-[12.5px] text-[#6B7283] leading-relaxed">
              <AlertTriangle size={15} className="text-[#B7791F] shrink-0 mt-0.5" />
              Use <strong className="text-[#13182B]">Project Settings</strong> to limit which sections a client sees or to hide payment amounts.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Credential({ label, value, mono, onCopy, copied }: { label: string; value: string; mono?: boolean; onCopy: () => void; copied: boolean }) {
  return (
    <div>
      <label className="block font-mono text-[11px] text-[#9AA0AD] mb-1">{label}</label>
      <div className="flex items-center gap-2 border border-[#E5E2D9] rounded-xl bg-[#FCFBF8] pl-3.5 pr-2 py-2.5">
        <span className={`flex-1 min-w-0 truncate text-[14px] text-[#13182B] ${mono ? "font-mono tracking-[0.15em] font-semibold text-[16px]" : ""}`}>{value}</span>
        <button onClick={onCopy} className="text-[#6B7283] hover:text-[#2B41E0] p-1.5 rounded-lg hover:bg-white shrink-0">{copied ? <Check size={15} className="text-[#0F9D6B]" /> : <Copy size={15} />}</button>
      </div>
    </div>
  );
}

// ── Feedback (client ↔ team comments per stage) ───────────────────────────────
function CommentsTab({ project, canWrite, authorName }: { project: Project; canWrite: boolean; authorName: string }) {
  const [comments, setComments] = useState<StageComment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const stages = project.stages || [];

  useEffect(() => streamStageComments(project.id, setComments), [project.id]);

  const byStage = (sid: string) => comments.filter((c) => c.stageId === sid).sort((a, b) => a.createdAt - b.createdAt);
  const general = comments.filter((c) => !stages.some((s) => s.id === c.stageId));

  const post = async (stageId: string) => {
    const text = (drafts[stageId] || "").trim();
    if (!text) return;
    setDrafts((d) => ({ ...d, [stageId]: "" }));
    await addStageComment(project.id, { stageId, author: authorName, role: "team", text, createdAt: Date.now() });
  };

  const total = comments.length;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-5">
        <p className="text-[14px] text-[#6B7283]">Feedback your client leaves on each stage from their portal lands here. Reply inline to keep the conversation in one place.</p>
      </div>

      {total === 0 && stages.length === 0 && (
        <div className="border-2 border-dashed border-[#D7D3C7] rounded-2xl p-8 text-center text-[#9AA0AD] text-[14px]">Add timeline stages first — that's where clients can comment.</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {stages.map((s) => {
          const list = byStage(s.id);
          return (
            <div key={s.id} className={card}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-[#13182B] text-[15px] flex items-center gap-2"><StageDot status={s.status} /> {s.name}</h3>
                <span className="font-mono text-[11px] text-[#9AA0AD]">{list.length} comment{list.length === 1 ? "" : "s"}</span>
              </div>
              {list.length === 0 ? (
                <p className="text-[13px] text-[#9AA0AD] mb-3">No feedback on this stage yet.</p>
              ) : (
                <div className="space-y-2.5 mb-3">
                  {list.map((c) => <CommentBubble key={c.id} c={c} canWrite={canWrite} onDelete={() => removeStageComment(project.id, c.id)} />)}
                </div>
              )}
              {canWrite && (
                <div className="flex items-center gap-2">
                  <input value={drafts[s.id] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") post(s.id); }} placeholder="Reply to your client…"
                    className="flex-1 text-[13.5px] bg-[#FCFBF8] border border-[#E5E2D9] rounded-xl px-3.5 py-2.5 outline-none focus:border-[#2B41E0]" />
                  <button onClick={() => post(s.id)} disabled={!(drafts[s.id] || "").trim()} className="bg-[#13182B] text-white px-4 py-2.5 rounded-xl font-semibold text-[13px] flex items-center gap-1.5 disabled:opacity-50"><Send size={14} /> Send</button>
                </div>
              )}
            </div>
          );
        })}

        {general.length > 0 && (
          <div className={card}>
            <h3 className="font-bold text-[#13182B] text-[15px] mb-3">General feedback</h3>
            <div className="space-y-2.5">
              {general.map((c) => <CommentBubble key={c.id} c={c} canWrite={canWrite} onDelete={() => removeStageComment(project.id, c.id)} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentBubble({ c, canWrite, onDelete }: { c: StageComment; canWrite: boolean; onDelete: () => void }) {
  const isClient = c.role === "client";
  return (
    <div className={`group flex gap-3 rounded-xl px-3.5 py-2.5 border ${isClient ? "bg-[#FCFBF8] border-[#E5E2D9]" : "bg-[#EDEFFF] border-[#2B41E0]/15"}`}>
      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-[13px] shrink-0 ${isClient ? "bg-[#FF5C49]" : "bg-[#2B41E0]"}`}>{c.author.charAt(0).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-semibold text-[#13182B]">{c.author}</span>
          <span className={`font-mono text-[9.5px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isClient ? "bg-[#FFEDE9] text-[#FF5C49]" : "bg-white text-[#2B41E0]"}`}>{isClient ? "Client" : "Team"}</span>
          <span className="font-mono text-[10.5px] text-[#9AA0AD]">{new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
        <p className="text-[13.5px] text-[#3A4257] whitespace-pre-wrap leading-relaxed">{c.text}</p>
      </div>
      {canWrite && <button onClick={onDelete} className="text-[#D7D3C7] hover:text-[#FF5C49] opacity-0 group-hover:opacity-100 shrink-0 self-start"><Trash2 size={14} /></button>}
    </div>
  );
}

interface TabProps { project: Project; save: (data: Partial<Project>) => Promise<void> | void; canWrite: boolean; }

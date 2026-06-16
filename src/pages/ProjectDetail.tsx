import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth-context";
import { Loader } from "../components/ui";
import { logAction } from "../lib/audit";
import {
  ArrowLeft, Trash2, Plus, X, GripVertical, Check, Circle, Clock, ChevronUp, ChevronDown,
  ListChecks, CircleDollarSign, FileText, KeyRound, LayoutDashboard, Users, Send, Copy,
  RefreshCw, Eye, AlertTriangle,
} from "lucide-react";
import {
  patchProject, removeProject, milestoneAmount, formatINR, genCode, uid, emptyForm,
  type Project, type ProjectStage, type PaymentMilestone, type RequirementField,
  type ProjectClient, type StageStatus, type ProjectStatus, type FieldType,
} from "../lib/projects";

// Old project docs (pre-rebuild) may be missing the new fields — fill safe defaults.
function normalize(p: any): Project {
  return {
    ...p,
    status: p.status || "active",
    summary: p.summary || "",
    clients: Array.isArray(p.clients) ? p.clients : [],
    stages: Array.isArray(p.stages) ? p.stages : [],
    payment: p.payment && typeof p.payment === "object"
      ? { total: p.payment.total || 0, currency: p.payment.currency || "INR", milestones: Array.isArray(p.payment.milestones) ? p.payment.milestones : [] }
      : { total: 0, currency: "INR", milestones: [] },
    requirementForm: p.requirementForm && Array.isArray(p.requirementForm.fields) ? p.requirementForm : emptyForm(),
    portal: p.portal || null,
  };
}

const PORTAL_BASE = (import.meta.env.VITE_PORTAL_URL as string) || "http://localhost:3000/portal";

type Tab = "overview" | "timeline" | "payments" | "requirements" | "access";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "timeline", label: "Timeline", icon: ListChecks },
  { key: "payments", label: "Payments", icon: CircleDollarSign },
  { key: "requirements", label: "Requirements", icon: FileText },
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
  const { can } = useAuth();
  const canWrite = can("projects", "write");

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#E5E2D9] mb-7 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key ? "border-[#2B41E0] text-[#2B41E0]" : "border-transparent text-[#6B7283] hover:text-[#13182B]"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab project={project} save={save} canWrite={canWrite} />}
      {tab === "timeline" && <TimelineTab project={project} save={save} canWrite={canWrite} />}
      {tab === "payments" && <PaymentsTab project={project} save={save} canWrite={canWrite} />}
      {tab === "requirements" && <RequirementsTab project={project} save={save} canWrite={canWrite} />}
      {tab === "access" && <AccessTab project={project} save={save} canWrite={canWrite} />}
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

// ── Timeline ────────────────────────────────────────────────────────────────
function TimelineTab({ project, save, canWrite }: TabProps) {
  const stages = project.stages || [];
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

  return (
    <div className="max-w-3xl animate-fade-in">
      <p className="text-[14px] text-[#6B7283] mb-5">Build the timeline your client sees. Mark a stage <strong className="text-[#0F9D6B]">done</strong> as you complete it, or <strong className="text-[#2B41E0]">active</strong> for what's in progress now.</p>

      <div className="space-y-3 mb-6">
        {stages.length === 0 && <div className="border-2 border-dashed border-[#D7D3C7] rounded-2xl p-8 text-center text-[#9AA0AD] text-[14px]">No stages yet. Add your first one below.</div>}
        {stages.map((s, i) => (
          <div key={s.id} className="bg-white border border-[#E5E2D9] rounded-2xl p-4 shadow-sm flex gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <button disabled={!canWrite || i === 0} onClick={() => move(i, -1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30"><ChevronUp size={16} /></button>
              <GripVertical size={14} className="text-[#D7D3C7]" />
              <button disabled={!canWrite || i === stages.length - 1} onClick={() => move(i, 1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30"><ChevronDown size={16} /></button>
            </div>
            <StageDot status={s.status} />
            <div className="flex-1 min-w-0">
              {canWrite ? (
                <>
                  <input value={s.name} onChange={(e) => edit(s.id, { name: e.target.value })} className="w-full font-semibold text-[15px] text-[#13182B] bg-transparent outline-none border-b border-transparent focus:border-[#E5E2D9] pb-0.5" />
                  <input value={s.description || ""} onChange={(e) => edit(s.id, { description: e.target.value })} placeholder="Add a short description…" className="w-full text-[13px] text-[#6B7283] bg-transparent outline-none mt-1" />
                </>
              ) : (
                <><div className="font-semibold text-[15px] text-[#13182B]">{s.name}</div>{s.description && <div className="text-[13px] text-[#6B7283] mt-1">{s.description}</div>}</>
              )}
            </div>
            {canWrite && (
              <div className="flex items-center gap-1.5 shrink-0">
                <select value={s.status} onChange={(e) => setStatus(s.id, e.target.value as StageStatus)} className="text-[12px] font-semibold rounded-lg border border-[#D7D3C7] bg-[#FCFBF8] px-2 py-1.5 outline-none focus:border-[#2B41E0]">
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="done">Done</option>
                </select>
                <button onClick={() => remove(s.id)} className="text-[#9AA0AD] hover:text-[#FF5C49] p-1"><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canWrite && (
        <div className={card}>
          <h3 className="font-bold text-[#13182B] text-[15px] mb-3">Add a stage</h3>
          <div className="grid gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Stage name — e.g. Design & Prototyping" className={inp} />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Description (optional)" className={inp} />
            <button onClick={add} disabled={!name.trim()} className="self-start bg-[#13182B] text-white px-5 py-2.5 rounded-xl font-semibold text-[14px] flex items-center gap-2 disabled:opacity-50"><Plus size={16} /> Add stage</button>
          </div>
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
function PaymentsTab({ project, save, canWrite }: TabProps) {
  const payment = project.payment || { total: 0, currency: "INR", milestones: [] };
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

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className={`${card} mb-6`}>
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
      </div>

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
                <span className="font-bold text-[15px] text-[#13182B]">{formatINR(milestoneAmount(m, total))}</span>
                {canWrite && <button onClick={() => removeM(m.id)} className="text-[#9AA0AD] hover:text-[#FF5C49]"><Trash2 size={15} /></button>}
              </div>
            </div>

            {canWrite ? (
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
                <span>{m.kind === "percent" ? `${m.value}% of total` : "Fixed"}</span>
                {m.stageId && <span>· {stages.find((s) => s.id === m.stageId)?.name}</span>}
                <span className={`font-semibold ${m.status === "paid" ? "text-[#0F9D6B]" : "text-[#B7791F]"}`}>{m.status === "paid" ? "Paid" : "Due"}</span>
              </div>
            )}
          </div>
        ))}
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
    <div className="max-w-3xl animate-fade-in">
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
          <div className="space-y-4">
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

          <div className="space-y-3">
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
    return <div className="max-w-2xl animate-fade-in border-2 border-dashed border-[#D7D3C7] rounded-2xl p-8 text-center text-[#9AA0AD] text-[14px]">Add a client on the Overview tab first — portal access is granted to a client's email.</div>;
  }

  return (
    <div className="max-w-2xl animate-fade-in">
      {!portal ? (
        <div className={card}>
          <h3 className="font-bold text-[#13182B] text-[16px] mb-1.5">Grant portal access</h3>
          <p className="text-[13.5px] text-[#6B7283] mb-4">Pick the client who'll log in. We'll generate an access code you hand to them.</p>
          <div className="space-y-2">
            {clients.map((c) => (
              <button key={c.id} disabled={!canWrite} onClick={() => generate(c.email)} className="w-full flex items-center justify-between border border-[#E5E2D9] rounded-xl px-4 py-3 bg-[#FCFBF8] hover:border-[#2B41E0] text-left disabled:opacity-60">
                <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#13182B] truncate">{c.name}</span><span className="block text-[12px] text-[#9AA0AD] truncate">{c.email}</span></span>
                <span className="text-[13px] font-semibold text-[#2B41E0] flex items-center gap-1 shrink-0"><KeyRound size={14} /> Grant</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
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

interface TabProps { project: Project; save: (data: Partial<Project>) => Promise<void> | void; canWrite: boolean; }

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth-context";
import { Loader } from "../components/ui";
import {
  ArrowLeft, Trash2, Plus, X, Check, Circle, Clock, ChevronUp, ChevronDown,
  Calendar, Package, ExternalLink, Users,
} from "lucide-react";
import {
  patchOurProject, removeOurProject, newOurStage, newOurTask, stageProgress, projectProgress,
  type OurProject, type OurStage, type OurTask,
} from "../lib/ourProjects";
import type { ProjectStatus, StageStatus } from "../lib/projects";

const tsToDateInput = (ts?: number | null) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");
const dateInputToTs = (v: string) => (v ? new Date(v + "T00:00:00").getTime() : null);
const fmtDate = (ts?: number | null) => (ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
const isOverdue = (ts?: number | null, done?: boolean) => !!ts && !done && ts < Date.now();

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#EDEFFF] text-[#2B41E0]",
  "on-hold": "bg-[#FFF4E5] text-[#B7791F]",
  completed: "bg-[#E6F6EF] text-[#0F9D6B]",
};

interface MemberRow { uid: string; name: string; email: string; }
interface ProductRow { id: string; title: string; link?: string; }

function normalize(p: any): OurProject {
  return {
    ...p,
    summary: p.summary || "",
    productId: p.productId || null,
    status: p.status || "active",
    team: Array.isArray(p.team) ? p.team : [],
    stages: (Array.isArray(p.stages) ? p.stages : []).map((s: any) => ({
      ...s, description: s.description || "", deadline: s.deadline ?? null,
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
    })),
  };
}

const card = "bg-white border border-[#E5E2D9] rounded-[18px] p-6 shadow-sm";
const inp = "w-full px-[13px] py-[11px] rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[#13182B] text-[14px] focus:border-[#0F9D6B] outline-none";

export default function OurProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWrite = can("projects", "write");

  const [project, setProject] = useState<OurProject | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageName, setStageName] = useState("");

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "ourProjects", id), (snap) => {
      setProject(snap.exists() ? normalize({ id: snap.id, ...snap.data() }) : null);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "members"), (snap) => setMembers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) })) as MemberRow[]));
    const u2 = onSnapshot(collection(db, "products"), (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProductRow[]));
    return () => { u1(); u2(); };
  }, []);

  if (loading) return <Loader label="Loading project" />;
  if (!project) return (
    <div className="font-['Poppins',sans-serif] py-20 text-center">
      <p className="text-[#13182B] font-bold text-[18px] mb-2">Project not found</p>
      <Link to="/our-projects" className="text-[#0F9D6B] font-semibold">← Back to our projects</Link>
    </div>
  );

  const save = (data: Partial<OurProject>) => patchOurProject(project.id, data);
  const stages = project.stages || [];
  const updateStages = (list: OurStage[]) => save({ stages: list });
  const linkedProduct = products.find((p) => p.id === project.productId);

  const addStage = () => { if (!stageName.trim()) return; updateStages([...stages, newOurStage(stageName.trim())]); setStageName(""); };
  const editStage = (sid: string, patch: Partial<OurStage>) => updateStages(stages.map((s) => s.id === sid ? { ...s, ...patch } : s));
  const removeStage = (sid: string) => updateStages(stages.filter((s) => s.id !== sid));
  const moveStage = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= stages.length) return; const next = [...stages]; [next[i], next[j]] = [next[j], next[i]]; updateStages(next); };

  return (
    <div className="font-['Poppins',sans-serif]">
      <button onClick={() => navigate("/our-projects")} className="flex items-center gap-1.5 text-[#6B7283] hover:text-[#13182B] text-[13.5px] font-medium mb-5">
        <ArrowLeft size={16} /> All our projects
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-2">
            {canWrite ? (
              <select value={project.status} onChange={(e) => save({ status: e.target.value as ProjectStatus })} className={`font-mono text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold border-0 outline-none ${STATUS_STYLES[project.status]}`}>
                <option value="active">active</option>
                <option value="on-hold">on-hold</option>
                <option value="completed">completed</option>
              </select>
            ) : (
              <span className={`font-mono text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold ${STATUS_STYLES[project.status]}`}>{project.status}</span>
            )}
            <span className="font-mono text-[11px] text-[#9AA0AD]">{projectProgress(project)}% complete</span>
          </div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-[#13182B] leading-none tracking-tight">{project.title}</h1>
          {project.summary && <p className="text-[#6B7283] mt-2.5 text-[15px] max-w-2xl leading-relaxed">{project.summary}</p>}
        </div>
        {canWrite && (
          <button onClick={async () => { if (confirm(`Delete "${project.title}"?`)) { await removeOurProject(project.id, project.title); navigate("/our-projects"); } }}
            className="text-[#FF5C49] hover:bg-[#FFEDE9] px-3.5 py-2 rounded-xl text-[13.5px] font-semibold flex items-center gap-1.5 transition-colors">
            <Trash2 size={15} /> Delete
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stages + tasks */}
        <div className="lg:col-span-2 space-y-3">
          {stages.length === 0 && <div className="border-2 border-dashed border-[#D7D3C7] rounded-2xl p-8 text-center text-[#9AA0AD] text-[14px]">No stages yet. Add the first phase of this build below.</div>}
          {stages.map((s, i) => (
            <StageCard key={s.id} stage={s} index={i} total={stages.length} members={members} canWrite={canWrite}
              onEdit={(patch) => editStage(s.id, patch)} onRemove={() => removeStage(s.id)} onMove={(dir) => moveStage(i, dir)} />
          ))}
          {canWrite && (
            <div className={card}>
              <h3 className="font-bold text-[#13182B] text-[15px] mb-3">Add a stage</h3>
              <div className="flex gap-3">
                <input value={stageName} onChange={(e) => setStageName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addStage(); }} placeholder="Stage name — e.g. Build & QA" className={inp} />
                <button onClick={addStage} disabled={!stageName.trim()} className="bg-[#13182B] text-white px-5 rounded-xl font-semibold text-[14px] flex items-center gap-2 disabled:opacity-50 shrink-0"><Plus size={16} /> Add</button>
              </div>
            </div>
          )}
        </div>

        {/* Side: product + team */}
        <div className="space-y-6">
          <div className={card}>
            <h3 className="font-bold text-[#13182B] text-[16px] mb-3 flex items-center gap-2"><Package size={17} className="text-[#0F9D6B]" /> Linked product</h3>
            {canWrite ? (
              <select value={project.productId || ""} onChange={(e) => save({ productId: e.target.value || null })} className={inp}>
                <option value="">— none —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            ) : (
              <p className="text-[14px] text-[#13182B]">{linkedProduct?.title || "Not linked"}</p>
            )}
            {linkedProduct && (
              <div className="mt-3 flex flex-col gap-2">
                <Link to="/products" className="text-[13px] font-semibold text-[#0F9D6B] flex items-center gap-1.5 hover:underline">Open in Products <ExternalLink size={13} /></Link>
                {linkedProduct.link && <a href={linkedProduct.link} target="_blank" rel="noreferrer" className="text-[13px] text-[#2B41E0] flex items-center gap-1.5 hover:underline truncate">{linkedProduct.link} <ExternalLink size={12} /></a>}
              </div>
            )}
          </div>

          <div className={card}>
            <h3 className="font-bold text-[#13182B] text-[16px] mb-3 flex items-center gap-2"><Users size={17} className="text-[#2B41E0]" /> Team</h3>
            <div className="space-y-1.5">
              {members.length === 0 && <p className="text-[13px] text-[#9AA0AD]">No members in the workspace.</p>}
              {members.map((m) => {
                const on = (project.team || []).includes(m.uid);
                return (
                  <button key={m.uid} disabled={!canWrite} onClick={() => save({ team: on ? project.team.filter((x) => x !== m.uid) : [...project.team, m.uid] })}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#FCFBF8] text-left disabled:cursor-default">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-[#2B41E0] border-[#2B41E0]" : "border-[#D7D3C7] bg-white"}`}>{on && <Check size={11} className="text-white" strokeWidth={3} />}</span>
                    <span className="text-[13.5px] text-[#13182B] truncate">{m.name || m.email}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StageDot({ status }: { status: StageStatus }) {
  if (status === "done") return <span className="w-6 h-6 rounded-full bg-[#E6F6EF] text-[#0F9D6B] flex items-center justify-center shrink-0"><Check size={13} strokeWidth={3} /></span>;
  if (status === "active") return <span className="w-6 h-6 rounded-full bg-[#EDEFFF] text-[#2B41E0] flex items-center justify-center shrink-0"><Clock size={13} /></span>;
  return <span className="w-6 h-6 rounded-full bg-[#F4F2EC] text-[#B6B2A6] flex items-center justify-center shrink-0"><Circle size={11} /></span>;
}

function StageCard({ stage, index, total, members, canWrite, onEdit, onRemove, onMove }: {
  stage: OurStage; index: number; total: number; members: MemberRow[]; canWrite: boolean;
  onEdit: (patch: Partial<OurStage>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [taskText, setTaskText] = useState("");
  const tasks = stage.tasks || [];
  const setTasks = (list: OurTask[]) => onEdit({ tasks: list });
  const addTask = () => { if (!taskText.trim()) return; setTasks([...tasks, newOurTask(taskText.trim())]); setTaskText(""); };
  const editTask = (tid: string, patch: Partial<OurTask>) => setTasks(tasks.map((t) => t.id === tid ? { ...t, ...patch } : t));
  const removeTask = (tid: string) => setTasks(tasks.filter((t) => t.id !== tid));
  const overdue = isOverdue(stage.deadline, stage.status === "done");

  return (
    <div className={card}>
      <div className="flex gap-3">
        {canWrite && (
          <div className="flex flex-col items-center gap-1 pt-0.5">
            <button disabled={index === 0} onClick={() => onMove(-1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30"><ChevronUp size={15} /></button>
            <button disabled={index === total - 1} onClick={() => onMove(1)} className="text-[#B6B2A6] hover:text-[#13182B] disabled:opacity-30"><ChevronDown size={15} /></button>
          </div>
        )}
        <StageDot status={stage.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {canWrite ? (
                <input value={stage.name} onChange={(e) => onEdit({ name: e.target.value })} className="w-full font-semibold text-[15.5px] text-[#13182B] bg-transparent outline-none border-b border-transparent focus:border-[#E5E2D9] pb-0.5" />
              ) : <div className="font-semibold text-[15.5px] text-[#13182B]">{stage.name}</div>}
            </div>
            {canWrite && (
              <div className="flex items-center gap-1.5 shrink-0">
                <select value={stage.status} onChange={(e) => onEdit({ status: e.target.value as StageStatus })} className="text-[12px] font-semibold rounded-lg border border-[#D7D3C7] bg-[#FCFBF8] px-2 py-1.5 outline-none focus:border-[#0F9D6B]">
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="done">Done</option>
                </select>
                <button onClick={onRemove} className="text-[#9AA0AD] hover:text-[#FF5C49] p-1"><Trash2 size={15} /></button>
              </div>
            )}
          </div>

          {/* Stage deadline */}
          <div className="flex items-center gap-1.5 mt-2.5 mb-3">
            <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${overdue ? "border-[#FF5C49]/40 bg-[#FFEDE9]" : "border-[#E5E2D9] bg-[#FCFBF8]"}`}>
              <Calendar size={13} className={overdue ? "text-[#FF5C49]" : "text-[#9AA0AD]"} />
              {canWrite ? (
                <input type="date" value={tsToDateInput(stage.deadline)} onChange={(e) => onEdit({ deadline: dateInputToTs(e.target.value) })} className={`text-[12.5px] bg-transparent outline-none ${overdue ? "text-[#FF5C49] font-semibold" : "text-[#13182B]"}`} />
              ) : <span className={`text-[12.5px] ${overdue ? "text-[#FF5C49] font-semibold" : "text-[#13182B]"}`}>{stage.deadline ? fmtDate(stage.deadline) : "No deadline"}</span>}
              {overdue && <span className="text-[10px] font-mono uppercase text-[#FF5C49] font-bold">Overdue</span>}
            </div>
            <span className="font-mono text-[11px] text-[#9AA0AD] ml-1">{stageProgress(stage)}%</span>
          </div>

          {/* Tasks */}
          <div className="space-y-1.5">
            {tasks.map((t) => {
              const tOver = isOverdue(t.deadline, t.done);
              return (
                <div key={t.id} className="flex items-center gap-2 group">
                  <button disabled={!canWrite} onClick={() => editTask(t.id, { done: !t.done })} className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${t.done ? "bg-[#0F9D6B] border-[#0F9D6B]" : "border-[#D7D3C7] bg-white"}`}>{t.done && <Check size={11} className="text-white" strokeWidth={3} />}</button>
                  {canWrite ? (
                    <input value={t.text} onChange={(e) => editTask(t.id, { text: e.target.value })} className={`flex-1 text-[13px] bg-transparent outline-none ${t.done ? "text-[#9AA0AD] line-through" : "text-[#13182B]"}`} />
                  ) : <span className={`flex-1 text-[13px] ${t.done ? "text-[#9AA0AD] line-through" : "text-[#13182B]"}`}>{t.text}</span>}
                  {canWrite && (
                    <select value={t.assignee || ""} onChange={(e) => editTask(t.id, { assignee: e.target.value })} className="text-[11px] rounded border border-[#E5E2D9] bg-[#FCFBF8] px-1.5 py-1 outline-none text-[#6B7283] max-w-[110px]">
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.uid} value={m.uid}>{(m.name || m.email).split(" ")[0]}</option>)}
                    </select>
                  )}
                  {canWrite ? (
                    <input type="date" value={tsToDateInput(t.deadline)} onChange={(e) => editTask(t.id, { deadline: dateInputToTs(e.target.value) })} className={`text-[11px] rounded border border-[#E5E2D9] bg-[#FCFBF8] px-1.5 py-1 outline-none ${tOver ? "text-[#FF5C49] font-semibold" : "text-[#6B7283]"}`} />
                  ) : t.deadline ? <span className={`text-[11px] font-mono ${tOver ? "text-[#FF5C49]" : "text-[#9AA0AD]"}`}>{fmtDate(t.deadline)}</span> : null}
                  {canWrite && <button onClick={() => removeTask(t.id)} className="text-[#D7D3C7] hover:text-[#FF5C49] opacity-0 group-hover:opacity-100"><X size={13} /></button>}
                </div>
              );
            })}
          </div>
          {canWrite && (
            <div className="flex items-center gap-2 mt-2.5">
              <input value={taskText} onChange={(e) => setTaskText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} placeholder="Add a task…" className="flex-1 text-[13px] bg-[#FCFBF8] border border-[#E5E2D9] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0F9D6B]" />
              <button onClick={addTask} disabled={!taskText.trim()} className="text-[#0F9D6B] disabled:opacity-40 p-1"><Plus size={16} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

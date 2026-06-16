import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  SlidersHorizontal, Plus, X, Check, UserCog, Users, Eye, EyeOff, Pencil, ShieldCheck,
} from "lucide-react";
import { PageHeader, Loader, EmptyState } from "../components/ui";
import {
  patchProject, defaultMember, PROJECT_SECTIONS,
  type Project, type ProjectMember, type ProjectSection,
} from "../lib/projects";

interface MemberRow { uid: string; name: string; email: string; }

export default function ProjectSettings() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Project[];
      setProjects(list);
      setSelectedId((cur) => cur || (list[0]?.id ?? ""));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "members"), (snap) => setMembers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) })) as MemberRow[]));
    return () => unsub();
  }, []);

  const project = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);

  if (loading) return <Loader label="Loading settings" sub="Loading project access controls" />;

  return (
    <div className="font-['Poppins',sans-serif]">
      <PageHeader
        icon={SlidersHorizontal}
        eyebrow="Administration"
        accent="#13182B"
        title="Project Settings"
        subtitle="Decide who's on each project and exactly what they can reach — which sections, whether they can edit, and whether payment amounts stay hidden."
      />

      {projects.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="No projects to configure" sub="Create a project first, then come back to manage its access." />
      ) : (
        <>
          <div className="mb-6 max-w-md">
            <label className="block font-mono text-[12px] text-[#6B7283] mb-[7px]">Project</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-full px-[14px] py-[13px] rounded-xl border border-[#D7D3C7] bg-white text-[#13182B] text-[15px] focus:border-[#2B41E0] outline-none shadow-sm">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          {project && <ProjectAccess project={project} members={members} />}
        </>
      )}
    </div>
  );
}

function ProjectAccess({ project, members }: { project: Project; members: MemberRow[] }) {
  const assigned = project.members || [];
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);

  const save = (list: ProjectMember[]) => patchProject(project.id, { members: list });
  const update = (id: string, patch: Partial<ProjectMember>) => save(assigned.map((m) => m.id === id ? { ...m, ...patch } : m));
  const remove = (id: string) => save(assigned.filter((m) => m.id !== id));

  const addTeam = (m: MemberRow) => { save([...assigned, defaultMember({ id: m.uid, kind: "team", name: m.name || m.email, email: m.email })]); setShowAddTeam(false); };
  const addClient = (c: { id: string; name: string; email: string }) => { save([...assigned, defaultMember({ id: c.id, kind: "client", name: c.name, email: c.email })]); setShowAddClient(false); };

  const availTeam = members.filter((m) => !assigned.some((a) => a.kind === "team" && a.id === m.uid));
  const availClients = (project.clients || []).filter((c) => !assigned.some((a) => a.kind === "client" && a.id === c.id));

  const team = assigned.filter((m) => m.kind === "team");
  const clients = assigned.filter((m) => m.kind === "client");

  return (
    <div className="animate-fade-in space-y-6">
      <AccessGroup
        title="Team access" icon={UserCog} accent="#2B41E0"
        sub="Internal members assigned to this project."
        list={team} onUpdate={update} onRemove={remove}
        addLabel="Add team member" showAdd={showAddTeam} setShowAdd={setShowAddTeam}
        addOptions={availTeam.map((m) => ({ id: m.uid, name: m.name || m.email, email: m.email }))}
        onAdd={(o) => addTeam(members.find((m) => m.uid === o.id)!)}
        emptyAdd="Everyone's already on this project."
      />
      <AccessGroup
        title="Client access" icon={Users} accent="#FF5C49"
        sub="Portal users — controls what they see and whether amounts are hidden."
        list={clients} onUpdate={update} onRemove={remove}
        addLabel="Add client" showAdd={showAddClient} setShowAdd={setShowAddClient}
        addOptions={availClients.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
        onAdd={(o) => addClient(o)}
        emptyAdd="Add clients to the project on its Overview tab first."
      />
    </div>
  );
}

interface AddOption { id: string; name: string; email: string; }

function AccessGroup({ title, icon: Icon, accent, sub, list, onUpdate, onRemove, addLabel, showAdd, setShowAdd, addOptions, onAdd, emptyAdd }: {
  title: string; icon: any; accent: string; sub: string;
  list: ProjectMember[]; onUpdate: (id: string, patch: Partial<ProjectMember>) => void; onRemove: (id: string) => void;
  addLabel: string; showAdd: boolean; setShowAdd: (v: boolean) => void; addOptions: AddOption[]; onAdd: (o: AddOption) => void; emptyAdd: string;
}) {
  return (
    <div className="bg-white border border-[#E5E2D9] rounded-[18px] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-[#13182B] text-[16px] flex items-center gap-2"><Icon size={17} style={{ color: accent }} /> {title}</h3>
          <p className="text-[13px] text-[#6B7283] mt-0.5">{sub}</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-[13px] font-semibold text-[#2B41E0] flex items-center gap-1 hover:underline shrink-0"><Plus size={14} /> {addLabel}</button>
      </div>

      {showAdd && (
        <div className="border border-[#E5E2D9] rounded-xl divide-y divide-[#EEEBE3] mb-4 max-h-52 overflow-y-auto">
          {addOptions.length === 0 && <div className="p-3.5 text-[13px] text-[#9AA0AD] text-center">{emptyAdd}</div>}
          {addOptions.map((o) => (
            <button key={o.id} onClick={() => onAdd(o)} className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[#FCFBF8] text-left">
              <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#13182B] truncate">{o.name}</span><span className="block text-[12px] text-[#9AA0AD] truncate">{o.email}</span></span>
              <Plus size={16} className="text-[#2B41E0] shrink-0" />
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-[13.5px] text-[#9AA0AD]">No one added yet.</p>
      ) : (
        <div className="space-y-3">
          {list.map((m) => <MemberRowCard key={m.id} m={m} onUpdate={(patch) => onUpdate(m.id, patch)} onRemove={() => onRemove(m.id)} />)}
        </div>
      )}
    </div>
  );
}

function MemberRowCard({ m, onUpdate, onRemove }: { m: ProjectMember; onUpdate: (patch: Partial<ProjectMember>) => void; onRemove: () => void }) {
  const toggleSection = (key: ProjectSection) => {
    const has = m.sections.includes(key);
    onUpdate({ sections: has ? m.sections.filter((s) => s !== key) : [...m.sections, key] });
  };

  return (
    <div className="border border-[#E5E2D9] rounded-xl p-4 bg-[#FCFBF8]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full text-white flex items-center justify-center font-semibold text-[14px] shrink-0" style={{ background: m.kind === "team" ? "#2B41E0" : "#FF5C49" }}>{m.name.charAt(0).toUpperCase()}</span>
          <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#13182B] truncate">{m.name}</span><span className="block text-[12px] text-[#9AA0AD] truncate">{m.email}</span></span>
        </div>
        <button onClick={onRemove} className="text-[#9AA0AD] hover:text-[#FF5C49] shrink-0"><X size={16} /></button>
      </div>

      <div className="mb-3">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#9AA0AD] mb-2">Visible sections</div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_SECTIONS.map((sec) => {
            const on = m.sections.includes(sec.key);
            return (
              <button key={sec.key} onClick={() => toggleSection(sec.key)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${on ? "bg-[#EDEFFF] text-[#2B41E0] border-[#2B41E0]/30" : "bg-white text-[#9AA0AD] border-[#E5E2D9]"}`}>
                {on ? <Check size={12} strokeWidth={3} /> : <X size={12} />} {sec.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-[#EEEBE3]">
        <Toggle on={m.canWrite} onClick={() => onUpdate({ canWrite: !m.canWrite })}
          onIcon={Pencil} offIcon={ShieldCheck} onLabel="Can edit" offLabel="Read-only" accent="#0F9D6B" />
        <Toggle on={m.hidePayments} onClick={() => onUpdate({ hidePayments: !m.hidePayments })}
          onIcon={EyeOff} offIcon={Eye} onLabel="Amounts hidden" offLabel="Amounts visible" accent="#B7791F" />
      </div>
    </div>
  );
}

function Toggle({ on, onClick, onIcon: OnIcon, offIcon: OffIcon, onLabel, offLabel, accent }: {
  on: boolean; onClick: () => void; onIcon: any; offIcon: any; onLabel: string; offLabel: string; accent: string;
}) {
  return (
    <button onClick={onClick} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
      style={{ borderColor: on ? `${accent}55` : "#E5E2D9", background: on ? `${accent}12` : "#fff", color: on ? accent : "#9AA0AD" }}>
      {on ? <OnIcon size={13} /> : <OffIcon size={13} />} {on ? onLabel : offLabel}
    </button>
  );
}

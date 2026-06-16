import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../lib/firebase";
import { Plus, X, FolderKanban, Search, Users, ChevronRight, CircleDollarSign, ListChecks, Check } from "lucide-react";
import { PageHeader, Loader, EmptyState } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import {
  createProject, milestoneAmount, formatINR,
  type Project, type ProjectClient,
} from "../lib/projects";

interface ClientRow { id: string; name: string; company?: string; email: string; }

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#EDEFFF] text-[#2B41E0]",
  "on-hold": "bg-[#FFF4E5] text-[#B7791F]",
  completed: "bg-[#E6F6EF] text-[#0F9D6B]",
};

export default function Projects() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWrite = can("projects", "write");

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Project[]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ClientRow[]);
    });
    return () => unsub();
  }, []);

  if (loading) return <Loader label="Loading projects" sub="Pulling your active builds" />;

  const activeCount = projects.filter((p) => p.status === "active").length;

  return (
    <div className="font-['Poppins',sans-serif] relative">
      <PageHeader
        icon={FolderKanban}
        eyebrow="Delivery"
        accent="#2B41E0"
        title="Projects"
        subtitle="Each project bundles its clients, a custom timeline, a payment schedule and a requirements form — everything your client tracks in their portal."
        stats={[
          { label: "Active", value: activeCount, accent: "#2B41E0" },
          { label: "Total", value: projects.length, accent: "#13182B" },
        ]}
        actions={canWrite && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#13182B] text-white px-5 py-2.5 rounded-xl font-semibold text-[14.5px] flex items-center gap-2 hover:-translate-y-0.5 transition-transform shadow-md justify-center"
          >
            <Plus size={18} /> New Project
          </button>
        )}
      />

      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" sub="Create your first project and add the clients from your CRM who'll be tracking it." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-up">
          {projects.map((p) => <ProjectCard key={p.id} p={p} onOpen={() => navigate(`/projects/${p.id}`)} />)}
        </div>
      )}

      {showModal && (
        <NewProjectModal clients={clients} onClose={() => setShowModal(false)} onCreated={(id) => { setShowModal(false); navigate(`/projects/${id}`); }} />
      )}
    </div>
  );
}

function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const stages = p.stages || [];
  const done = stages.filter((s) => s.status === "done").length;
  const pct = stages.length ? Math.round((done / stages.length) * 100) : 0;
  const total = p.payment?.total || 0;
  const paid = (p.payment?.milestones || [])
    .filter((m) => m.status === "paid")
    .reduce((sum, m) => sum + milestoneAmount(m, total), 0);

  return (
    <button
      onClick={onOpen}
      className="text-left bg-white border border-[#D7D3C7] rounded-[20px] p-6 hover:border-[#2B41E0] transition-colors group shadow-sm hover:shadow-md flex flex-col"
    >
      <div className="flex justify-between items-start mb-4">
        <span className={`font-mono text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold ${STATUS_STYLES[p.status] || STATUS_STYLES.active}`}>
          {p.status}
        </span>
        <ChevronRight size={18} className="text-[#9AA0AD] group-hover:text-[#2B41E0] transition-colors" />
      </div>

      <h3 className="font-bold text-[#13182B] text-[19px] leading-tight mb-1.5">{p.title}</h3>
      <div className="flex items-center gap-1.5 text-[#6B7283] text-[13px] mb-5">
        <Users size={13} className="text-[#9AA0AD]" />
        <span className="truncate">{(p.clients || []).map((c) => c.name).join(", ") || "No clients yet"}</span>
      </div>

      <div className="mt-auto space-y-3.5 pt-4 border-t border-[#E5E2D9]">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#6B7283]"><ListChecks size={12} /> Timeline</span>
            <span className="font-mono text-[11px] text-[#13182B] font-semibold">{done}/{stages.length} · {pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#E5E2D9] overflow-hidden">
            <div className="h-full bg-[#2B41E0] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#6B7283]"><CircleDollarSign size={12} /> Payments</span>
          <span className="font-mono text-[11px] text-[#13182B] font-semibold">{formatINR(paid)} <span className="text-[#9AA0AD]">/ {formatINR(total)}</span></span>
        </div>
      </div>
    </button>
  );
}

function NewProjectModal({ clients, onClose, onCreated }: {
  clients: ClientRow[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => `${c.name} ${c.company || ""} ${c.email}`.toLowerCase().includes(q));
  }, [clients, search]);

  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || picked.length === 0) return;
    setSaving(true);
    try {
      const selected: ProjectClient[] = picked.map((id) => {
        const c = clients.find((x) => x.id === id)!;
        return { id: c.id, name: c.name, email: c.email, company: c.company === "N/A" ? "" : c.company };
      });
      const id = await createProject(title.trim(), summary.trim(), selected);
      onCreated(id);
    } catch (err) {
      console.error("create project failed", err);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#13182B]/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-lg border border-[#D7D3C7] rounded-[24px] shadow-2xl overflow-hidden flex flex-col my-8">
        <div className="px-6 py-5 md:px-8 md:py-6 border-b border-[#E5E2D9] flex justify-between items-center bg-[#FCFBF8]">
          <div>
            <div className="font-mono text-[11px] text-[#2B41E0] tracking-[0.16em] uppercase font-semibold mb-1">New Project</div>
            <h2 className="text-[20px] md:text-[22px] font-bold text-[#13182B] leading-none">Create a project</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#E5E2D9] text-[#6B7283] hover:bg-[#D7D3C7]"><X size={16} strokeWidth={2.5} /></button>
        </div>

        <form onSubmit={submit} className="p-6 md:p-8 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block font-mono text-[12px] text-[#6B7283] mb-[7px]">Project Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. NGO Management Platform"
              className="w-full px-[14px] py-[13px] rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[#13182B] text-[15px] focus:border-[#2B41E0] outline-none" />
          </div>
          <div>
            <label className="block font-mono text-[12px] text-[#6B7283] mb-[7px]">Summary <span className="text-[#9AA0AD]">(optional)</span></label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="One line the client will see at the top of their portal."
              className="w-full px-[14px] py-[13px] rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[#13182B] text-[15px] focus:border-[#2B41E0] outline-none resize-none" />
          </div>

          <div>
            <label className="block font-mono text-[12px] text-[#6B7283] mb-2">Add clients from CRM <span className="text-[#9AA0AD]">({picked.length} selected)</span></label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AD]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your clients…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[14px] text-[#13182B] focus:border-[#2B41E0] outline-none" />
            </div>
            <div className="border border-[#E5E2D9] rounded-xl divide-y divide-[#EEEBE3] max-h-52 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="p-4 text-[13px] text-[#9AA0AD] text-center">No clients found. Add them in the CRM first.</div>
              )}
              {filtered.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button type="button" key={c.id} onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#FCFBF8] text-left">
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? "bg-[#2B41E0] border-[#2B41E0]" : "border-[#D7D3C7] bg-white"}`}>
                      {on && <Check size={13} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-[#13182B] truncate">{c.name}{c.company && c.company !== "N/A" ? <span className="text-[#9AA0AD] font-normal"> · {c.company}</span> : ""}</span>
                      <span className="block text-[12px] text-[#9AA0AD] truncate">{c.email}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-[#F4F2EC] text-[#6B7283] font-semibold py-3 rounded-xl hover:bg-[#E5E2D9] transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !title.trim() || picked.length === 0}
              className="flex-1 bg-[#13182B] text-white font-semibold py-3 rounded-xl shadow-md hover:-translate-y-[2px] transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0">
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

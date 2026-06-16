import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, collectionGroup } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import {
  LayoutDashboard, FolderKanban, CircleDollarSign, CalendarClock, AlertTriangle,
  MessageSquare, TrendingUp, CheckCircle2, Clock, ArrowRight,
} from "lucide-react";
import { PageHeader, Loader } from "../components/ui";
import { milestoneAmount, formatINR, type Project, type StageComment } from "../lib/projects";

interface FeedItem extends StageComment { projectId: string; projectTitle: string; }

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#EDEFFF] text-[#2B41E0]",
  "on-hold": "bg-[#FFF4E5] text-[#B7791F]",
  completed: "bg-[#E6F6EF] text-[#0F9D6B]",
};

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [comments, setComments] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Project[]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Recent client feedback across every project (one collectionGroup listener).
  useEffect(() => {
    const unsub = onSnapshot(collectionGroup(db, "comments"), (snap) => {
      setComments(snap.docs.map((d) => {
        const ref = d.ref.parent.parent;
        return { id: d.id, projectId: ref?.id || "", projectTitle: "", ...(d.data() as any) } as FeedItem;
      }).filter((c) => c.role === "client"));
    }, () => setComments([]));
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    let stagesTotal = 0, stagesDone = 0, overdue = 0;
    let contract = 0, collected = 0;
    const upcoming: { project: Project; stage: any }[] = [];
    const now = Date.now();
    const byStatus = { active: 0, "on-hold": 0, completed: 0 } as Record<string, number>;

    for (const p of projects) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      const stages = p.stages || [];
      stagesTotal += stages.length;
      stagesDone += stages.filter((s) => s.status === "done").length;
      for (const s of stages) {
        if (s.deadline && s.status !== "done") {
          if (s.deadline < now) overdue++;
          else upcoming.push({ project: p, stage: s });
        }
      }
      const total = p.payment?.total || 0;
      contract += total;
      collected += (p.payment?.milestones || []).filter((m) => m.status === "paid").reduce((sum, m) => sum + milestoneAmount(m, total), 0);
    }
    upcoming.sort((a, b) => (a.stage.deadline || 0) - (b.stage.deadline || 0));
    const pct = stagesTotal ? Math.round((stagesDone / stagesTotal) * 100) : 0;
    return { stagesTotal, stagesDone, pct, overdue, contract, collected, outstanding: contract - collected, upcoming: upcoming.slice(0, 6), byStatus };
  }, [projects]);

  const titleFor = (pid: string) => projects.find((p) => p.id === pid)?.title || "Project";
  const feed = useMemo(() => [...comments].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), [comments]);

  if (loading) return <Loader label="Loading dashboard" sub="Crunching your delivery numbers" />;

  return (
    <div className="font-['Poppins',sans-serif]">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Delivery"
        accent="#2B41E0"
        title="Projects Dashboard"
        subtitle="A live read on every client build — progress, money, deadlines and the latest feedback, all in one place."
        stats={[
          { label: "Active", value: stats.byStatus.active || 0, accent: "#2B41E0" },
          { label: "Completed", value: stats.byStatus.completed || 0, accent: "#0F9D6B" },
          { label: "Projects", value: projects.length, accent: "#13182B" },
        ]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-fade-up">
        <Kpi icon={TrendingUp} accent="#2B41E0" label="Overall progress" value={`${stats.pct}%`} sub={`${stats.stagesDone}/${stats.stagesTotal} stages done`} />
        <Kpi icon={CircleDollarSign} accent="#0F9D6B" label="Collected" value={formatINR(stats.collected)} sub={`of ${formatINR(stats.contract)} contracted`} />
        <Kpi icon={Clock} accent="#B7791F" label="Outstanding" value={formatINR(stats.outstanding)} sub="across all projects" />
        <Kpi icon={AlertTriangle} accent={stats.overdue ? "#FF5C49" : "#9AA0AD"} label="Overdue stages" value={String(stats.overdue)} sub={stats.overdue ? "need attention" : "all on track"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project list with progress */}
        <div className="lg:col-span-2 bg-white border border-[#E5E2D9] rounded-[18px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-[#13182B] text-[16px] flex items-center gap-2"><FolderKanban size={17} className="text-[#2B41E0]" /> All projects</h3>
            <Link to="/projects" className="text-[13px] font-semibold text-[#2B41E0] flex items-center gap-1 hover:underline">Manage <ArrowRight size={14} /></Link>
          </div>
          {projects.length === 0 ? (
            <p className="text-[14px] text-[#9AA0AD] py-6 text-center">No projects yet.</p>
          ) : (
            <div className="space-y-2.5">
              {projects.map((p) => {
                const stages = p.stages || [];
                const done = stages.filter((s) => s.status === "done").length;
                const pct = stages.length ? Math.round((done / stages.length) * 100) : 0;
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-4 rounded-xl border border-[#E5E2D9] bg-[#FCFBF8] px-4 py-3 hover:border-[#2B41E0] transition-colors group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-semibold text-[14.5px] text-[#13182B] truncate">{p.title}</span>
                        <span className={`font-mono text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ${STATUS_STYLES[p.status] || STATUS_STYLES.active}`}>{p.status}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#E5E2D9] overflow-hidden">
                        <div className="h-full bg-[#2B41E0] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="font-mono text-[12px] text-[#13182B] font-semibold shrink-0 w-14 text-right">{done}/{stages.length}</span>
                    <ArrowRight size={16} className="text-[#9AA0AD] group-hover:text-[#2B41E0] shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Side column: deadlines + feedback */}
        <div className="space-y-6">
          <div className="bg-white border border-[#E5E2D9] rounded-[18px] p-6 shadow-sm">
            <h3 className="font-bold text-[#13182B] text-[16px] mb-4 flex items-center gap-2"><CalendarClock size={17} className="text-[#B7791F]" /> Upcoming deadlines</h3>
            {stats.upcoming.length === 0 ? (
              <div className="flex items-center gap-2 text-[13.5px] text-[#0F9D6B]"><CheckCircle2 size={16} /> Nothing due — you're clear.</div>
            ) : (
              <div className="space-y-2.5">
                {stats.upcoming.map(({ project, stage }) => (
                  <Link key={`${project.id}-${stage.id}`} to={`/projects/${project.id}`} className="block">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-[#13182B] truncate">{stage.name}</span>
                      <span className="font-mono text-[11px] text-[#B7791F] shrink-0">{new Date(stage.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </div>
                    <span className="text-[11.5px] text-[#9AA0AD] truncate block">{project.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E5E2D9] rounded-[18px] p-6 shadow-sm">
            <h3 className="font-bold text-[#13182B] text-[16px] mb-4 flex items-center gap-2"><MessageSquare size={17} className="text-[#FF5C49]" /> Recent feedback</h3>
            {feed.length === 0 ? (
              <p className="text-[13px] text-[#9AA0AD]">No client feedback yet.</p>
            ) : (
              <div className="space-y-3">
                {feed.map((c) => (
                  <Link key={c.id} to={`/projects/${c.projectId}`} className="block group">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="w-6 h-6 rounded-full bg-[#FF5C49] text-white flex items-center justify-center text-[11px] font-semibold shrink-0">{c.author.charAt(0).toUpperCase()}</span>
                      <span className="text-[12.5px] font-semibold text-[#13182B] truncate">{c.author}</span>
                      <span className="font-mono text-[10px] text-[#9AA0AD] ml-auto shrink-0">{new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </div>
                    <p className="text-[12.5px] text-[#6B7283] line-clamp-2 pl-8">{c.text}</p>
                    <span className="text-[11px] text-[#9AA0AD] pl-8 group-hover:text-[#2B41E0]">{titleFor(c.projectId)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, accent, label, value, sub }: { icon: any; accent: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-[#E5E2D9] rounded-[18px] p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}14`, color: accent }}><Icon size={17} /></div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#9AA0AD]">{label}</span>
      </div>
      <div className="text-[24px] font-bold leading-none tracking-tight" style={{ color: accent }}>{value}</div>
      <div className="text-[12px] text-[#9AA0AD] mt-1.5">{sub}</div>
    </div>
  );
}

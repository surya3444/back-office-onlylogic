import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../lib/firebase";
import { Plus, X, Boxes, ChevronRight, ListChecks, Package, ExternalLink, Image as ImageIcon, ArrowRight, Hammer } from "lucide-react";
import { PageHeader, Loader, EmptyState } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { createOurProject, projectProgress, type OurProject } from "../lib/ourProjects";

interface ProductRow { id: string; title: string; tag?: string; status?: string; description?: string; link?: string; imageUrl?: string; }

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#EDEFFF] text-[#2B41E0]",
  "on-hold": "bg-[#FFF4E5] text-[#B7791F]",
  completed: "bg-[#E6F6EF] text-[#0F9D6B]",
};

export default function OurProjects() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWrite = can("projects", "write");

  const [projects, setProjects] = useState<OurProject[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "ourProjects"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as OurProject[]);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) =>
      setProducts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProductRow[]));
    return () => unsub();
  }, []);

  const productName = (id?: string | null) => products.find((p) => p.id === id)?.title;
  const linkedProject = (productId: string) => projects.find((p) => p.productId === productId);

  // Spin up an internal build pre-linked to a storefront product.
  const startBuild = async (product: ProductRow) => {
    const existing = linkedProject(product.id);
    if (existing) { navigate(`/our-projects/${existing.id}`); return; }
    const id = await createOurProject(product.title, product.description || "", product.id);
    navigate(`/our-projects/${id}`);
  };

  if (loading) return <Loader label="Loading our projects" sub="Pulling our own builds" />;

  const activeCount = projects.filter((p) => p.status === "active").length;

  return (
    <div className="font-['Poppins',sans-serif] relative">
      <PageHeader
        icon={Boxes}
        eyebrow="In-house"
        accent="#0F9D6B"
        title="Our Projects"
        subtitle="The products we're building for ourselves. Plan timelines, break stages into tasks with deadlines, and tie each one to its storefront listing."
        stats={[
          { label: "Building", value: activeCount, accent: "#0F9D6B" },
          { label: "Total", value: projects.length, accent: "#13182B" },
        ]}
        actions={canWrite && (
          <button onClick={() => setShowModal(true)} className="bg-[#13182B] text-white px-5 py-2.5 rounded-xl font-semibold text-[14.5px] flex items-center gap-2 hover:-translate-y-0.5 transition-transform shadow-md justify-center">
            <Plus size={18} /> New Project
          </button>
        )}
      />

      {projects.length === 0 ? (
        <EmptyState icon={Boxes} title="No in-house projects yet" sub="Start one to plan the build of your own product — link it to a storefront listing and lay out the timeline." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-up">
          {projects.map((p) => {
            const pct = projectProgress(p);
            const tasks = (p.stages || []).reduce((n, s) => n + (s.tasks || []).length, 0);
            const doneTasks = (p.stages || []).reduce((n, s) => n + (s.tasks || []).filter((t) => t.done).length, 0);
            return (
              <button key={p.id} onClick={() => navigate(`/our-projects/${p.id}`)} className="text-left bg-white border border-[#D7D3C7] rounded-[20px] p-6 hover:border-[#0F9D6B] transition-colors group shadow-sm hover:shadow-md flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <span className={`font-mono text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold ${STATUS_STYLES[p.status] || STATUS_STYLES.active}`}>{p.status}</span>
                  <ChevronRight size={18} className="text-[#9AA0AD] group-hover:text-[#0F9D6B] transition-colors" />
                </div>
                <h3 className="font-bold text-[#13182B] text-[19px] leading-tight mb-1.5">{p.title}</h3>
                {productName(p.productId) ? (
                  <div className="flex items-center gap-1.5 text-[#0F9D6B] text-[13px] mb-5"><Package size={13} /> <span className="truncate">{productName(p.productId)}</span></div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[#9AA0AD] text-[13px] mb-5"><Package size={13} /> Not linked to a product</div>
                )}
                <div className="mt-auto space-y-3.5 pt-4 border-t border-[#E5E2D9]">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#6B7283]"><ListChecks size={12} /> Progress</span>
                      <span className="font-mono text-[11px] text-[#13182B] font-semibold">{doneTasks}/{tasks} tasks · {pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#E5E2D9] overflow-hidden">
                      <div className="h-full bg-[#0F9D6B] rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Storefront products — everything added in the Products section, ready to build against. */}
      <div className="mt-12">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <h2 className="text-[20px] font-bold text-[#13182B] tracking-tight flex items-center gap-2"><Package size={19} className="text-[#0F9D6B]" /> From Products</h2>
          <span className="font-mono text-[11px] text-[#9AA0AD]">{products.length} listing{products.length === 1 ? "" : "s"}</span>
        </div>
        <p className="text-[#6B7283] text-[14px] mb-5 max-w-2xl">Your storefront catalog. Start an in-house build against any product to plan its timeline, tasks and deadlines.</p>

        {products.length === 0 ? (
          <EmptyState icon={Package} title="No products yet" sub="Add products in the Products section and they'll show up here, ready to build against." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-up">
            {products.map((pr) => {
              const linked = linkedProject(pr.id);
              return (
                <div key={pr.id} className="bg-white border border-[#D7D3C7] rounded-[20px] p-6 shadow-sm flex flex-col">
                  {pr.imageUrl ? (
                    <div className="w-full h-36 mb-5 rounded-xl overflow-hidden border border-[#E5E2D9]"><img src={pr.imageUrl} alt={pr.title} className="w-full h-full object-cover" /></div>
                  ) : (
                    <div className="w-full h-36 mb-5 rounded-xl bg-[#F4F2EC] border border-[#E5E2D9] flex items-center justify-center text-[#9AA0AD]"><ImageIcon size={30} opacity={0.5} /></div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {pr.tag && <span className="bg-[#EDEFFF] text-[#2B41E0] font-mono text-[10.5px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold">{pr.tag}</span>}
                    <span className={`font-mono text-[10.5px] px-2.5 py-1 rounded-md uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 ${pr.status === "Ongoing" ? "bg-[#FFF6E5] text-[#B7791F]" : "bg-[#E6F6EF] text-[#0F9D6B]"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pr.status === "Ongoing" ? "bg-[#F59E0B]" : "bg-[#0F9D6B]"}`} /> {pr.status || "Live"}
                    </span>
                  </div>
                  <h3 className="font-bold text-[#13182B] text-[18px] mb-1.5 leading-tight">{pr.title}</h3>
                  {pr.description && <p className="text-[#6B7283] text-[13.5px] mb-4 flex-1 line-clamp-2">{pr.description}</p>}

                  <div className="mt-auto pt-4 border-t border-[#E5E2D9] flex items-center justify-between gap-2">
                    {pr.link ? (
                      <a href={pr.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#2B41E0] text-[13px] font-semibold hover:underline">View link <ExternalLink size={13} /></a>
                    ) : <span />}
                    {linked ? (
                      <button onClick={() => navigate(`/our-projects/${linked.id}`)} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0F9D6B] bg-[#E6F6EF] px-3.5 py-2 rounded-xl hover:bg-[#d6f0e4] transition-colors">Open build <ArrowRight size={14} /></button>
                    ) : canWrite ? (
                      <button onClick={() => startBuild(pr)} className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#13182B] px-3.5 py-2 rounded-xl hover:-translate-y-0.5 transition-transform shadow-sm"><Hammer size={14} /> Start a build</button>
                    ) : <span className="font-mono text-[11px] text-[#9AA0AD]">No build yet</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <NewOurProjectModal products={products} onClose={() => setShowModal(false)} onCreated={(id) => { setShowModal(false); navigate(`/our-projects/${id}`); }} />
      )}
    </div>
  );
}

function NewOurProjectModal({ products, onClose, onCreated }: { products: ProductRow[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const id = await createOurProject(title.trim(), summary.trim(), productId || null);
      onCreated(id);
    } catch (err) {
      console.error("create our-project failed", err);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#13182B]/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-lg border border-[#D7D3C7] rounded-[24px] shadow-2xl overflow-hidden flex flex-col my-8">
        <div className="px-6 py-5 md:px-8 md:py-6 border-b border-[#E5E2D9] flex justify-between items-center bg-[#FCFBF8]">
          <div>
            <div className="font-mono text-[11px] text-[#0F9D6B] tracking-[0.16em] uppercase font-semibold mb-1">New In-house Project</div>
            <h2 className="text-[20px] md:text-[22px] font-bold text-[#13182B] leading-none">Plan a build</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#E5E2D9] text-[#6B7283] hover:bg-[#D7D3C7]"><X size={16} strokeWidth={2.5} /></button>
        </div>
        <form onSubmit={submit} className="p-6 md:p-8 flex flex-col gap-5">
          <div>
            <label className="block font-mono text-[12px] text-[#6B7283] mb-[7px]">Project Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Only Logic CRM v2"
              className="w-full px-[14px] py-[13px] rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[#13182B] text-[15px] focus:border-[#0F9D6B] outline-none" />
          </div>
          <div>
            <label className="block font-mono text-[12px] text-[#6B7283] mb-[7px]">Summary <span className="text-[#9AA0AD]">(optional)</span></label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="What is this build about?"
              className="w-full px-[14px] py-[13px] rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[#13182B] text-[15px] focus:border-[#0F9D6B] outline-none resize-none" />
          </div>
          <div>
            <label className="block font-mono text-[12px] text-[#6B7283] mb-[7px]">Link to a product <span className="text-[#9AA0AD]">(optional)</span></label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full px-[14px] py-[13px] rounded-xl border border-[#D7D3C7] bg-[#FCFBF8] text-[#13182B] text-[15px] focus:border-[#0F9D6B] outline-none">
              <option value="">— none —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-[#F4F2EC] text-[#6B7283] font-semibold py-3 rounded-xl hover:bg-[#E5E2D9] transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="flex-1 bg-[#13182B] text-white font-semibold py-3 rounded-xl shadow-md hover:-translate-y-[2px] transition-transform disabled:opacity-50 disabled:hover:translate-y-0">
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

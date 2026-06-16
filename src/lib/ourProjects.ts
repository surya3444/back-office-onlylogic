import {
  collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { logAction } from "./audit";
import { uid, type StageStatus, type ProjectStatus } from "./projects";

// ── Types ─────────────────────────────────────────────────────────────────
// "Our Projects" are Only Logic's own builds — the products we ship. Each can
// link to a Products storefront entry and carries an internal delivery plan:
// stages, each broken into tasks with deadlines and owners. No clients, no
// payments, no portal — this is the team's working board.

export interface OurTask {
  id: string;
  text: string;
  done: boolean;
  deadline?: number | null;
  assignee?: string;
}

export interface OurStage {
  id: string;
  name: string;
  description?: string;
  status: StageStatus;
  deadline?: number | null;
  tasks: OurTask[];
}

export interface OurProject {
  id: string;
  title: string;
  summary?: string;
  productId?: string | null;   // optional link to a Products doc
  status: ProjectStatus;
  stages: OurStage[];
  team: string[];              // member uids working on it
  createdAt?: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function newOurStage(name: string): OurStage {
  return { id: uid(), name, description: "", status: "pending", deadline: null, tasks: [] };
}

export function newOurTask(text: string): OurTask {
  return { id: uid(), text, done: false, deadline: null, assignee: "" };
}

export function stageProgress(stage: OurStage): number {
  const t = stage.tasks || [];
  if (!t.length) return stage.status === "done" ? 100 : 0;
  return Math.round((t.filter((x) => x.done).length / t.length) * 100);
}

export function projectProgress(p: OurProject): number {
  const stages = p.stages || [];
  if (!stages.length) return 0;
  return Math.round(stages.reduce((sum, s) => sum + stageProgress(s), 0) / stages.length);
}

// ── Firestore ops ─────────────────────────────────────────────────────────

export function newOurProjectDoc(title: string, summary: string, productId: string | null) {
  return {
    title,
    summary: summary || "",
    productId: productId || null,
    status: "active" as ProjectStatus,
    stages: [] as OurStage[],
    team: [] as string[],
    createdAt: serverTimestamp(),
  };
}

export async function createOurProject(title: string, summary: string, productId: string | null) {
  const ref = await addDoc(collection(db, "ourProjects"), newOurProjectDoc(title, summary, productId));
  await logAction("Created internal project", title);
  return ref.id;
}

export async function patchOurProject(id: string, data: Partial<Omit<OurProject, "id">>) {
  await updateDoc(doc(db, "ourProjects", id), data as any);
}

export async function removeOurProject(id: string, title: string) {
  await deleteDoc(doc(db, "ourProjects", id));
  await logAction("Deleted internal project", title);
}

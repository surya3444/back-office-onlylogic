import {
  collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp,
  onSnapshot, query, orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import { logAction } from "./audit";

// ── Types ─────────────────────────────────────────────────────────────────
// A project is the central record clients track against. It bundles the people
// involved, a custom timeline, a payment schedule and a customisable
// requirements form. Everything a client sees in their portal lives here.

export interface ProjectClient {
  id: string;       // clients collection id
  name: string;
  email: string;
  company?: string;
}

export type StageStatus = "pending" | "active" | "done";

// A concrete thing shipped (or to ship) within a stage — surfaced to the client.
export interface StageFeature {
  id: string;
  text: string;
  done?: boolean;
}

export interface ProjectStage {
  id: string;
  name: string;
  description?: string;
  status: StageStatus;
  completedAt?: number | null;
  deadline?: number | null;        // ms timestamp — client-visible target date
  link?: string;                   // live/preview URL — client-visible "View" button
  features?: StageFeature[];       // what's being shipped in this stage
}

export type MilestoneKind = "percent" | "fixed";
export type MilestoneStatus = "due" | "paid";

export interface PaymentMilestone {
  id: string;
  label: string;
  stageId?: string | null;      // optional link to a timeline stage
  kind: MilestoneKind;          // percent of total, or a fixed amount
  value: number;                // 25 (=25%) or 5000 (=₹5000)
  status: MilestoneStatus;
  paidAt?: number | null;
  razorpayPaymentId?: string | null;
}

export interface Payment {
  total: number;                // total contract value
  currency: string;             // "INR"
  milestones: PaymentMilestone[];
}

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";

export interface RequirementField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];           // for select
}

export interface RequirementForm {
  title: string;
  intro?: string;
  fields: RequirementField[];
  sent: boolean;
  sentAt?: number | null;
  responses?: Record<string, string>;
  submittedAt?: number | null;
}

export interface PortalAccess {
  email: string;                // login identifier (a client's email)
  code: string;                 // access code we hand to the client
  enabled: boolean;
}

export type ProjectStatus = "active" | "on-hold" | "completed";

// ── Access control ──────────────────────────────────────────────────────────
// The sections a project is divided into — used to gate what an assigned
// member (team or client) can see, and the keys match the detail-page tabs.
export type ProjectSection =
  | "overview" | "timeline" | "payments" | "requirements" | "access" | "comments";

export const PROJECT_SECTIONS: { key: ProjectSection; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "payments", label: "Payments" },
  { key: "requirements", label: "Requirements" },
  { key: "comments", label: "Feedback" },
  { key: "access", label: "Client Access" },
];

// A person assigned to a project. `team` members are back-office accounts
// (matched by uid); `client` members are portal users (matched by email).
export interface ProjectMember {
  id: string;                 // member uid (team) or client id (client)
  kind: "team" | "client";
  name: string;
  email: string;
  sections: ProjectSection[]; // which sections this person may see
  canWrite: boolean;          // may edit the sections they can see
  hidePayments: boolean;      // hide ₹ amounts — show only Paid / Due
}

// Client feedback on a stage. Stored in subcollection projects/{id}/comments.
export interface StageComment {
  id: string;
  stageId: string;
  author: string;
  email?: string;
  role: "client" | "team";
  text: string;
  createdAt: number;
}

export interface Project {
  id: string;
  title: string;
  summary?: string;
  status: ProjectStatus;
  clients: ProjectClient[];
  stages: ProjectStage[];
  payment: Payment;
  requirementForm: RequirementForm;
  portal: PortalAccess | null;
  members?: ProjectMember[];
  createdAt?: any;
}

// All sections, granted by default when a member is first added.
export const ALL_SECTIONS: ProjectSection[] = PROJECT_SECTIONS.map((s) => s.key);

// Resolve the access entry for the signed-in member (by uid) or client (by email).
export function memberAccess(project: Project, opts: { uid?: string; email?: string }): ProjectMember | null {
  const list = project.members || [];
  if (opts.uid) {
    const m = list.find((x) => x.kind === "team" && x.id === opts.uid);
    if (m) return m;
  }
  if (opts.email) {
    const e = opts.email.trim().toLowerCase();
    const m = list.find((x) => x.kind === "client" && x.email.trim().toLowerCase() === e);
    if (m) return m;
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

export const uid = () => Math.random().toString(36).slice(2, 10);

// Friendly, unambiguous access code (no 0/O/1/I) — handed to the client.
export function genCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Resolve a milestone to a concrete rupee amount against the total.
export function milestoneAmount(m: PaymentMilestone, total: number): number {
  if (m.kind === "percent") return Math.round((total * m.value) / 100);
  return Math.round(m.value);
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
}

export function emptyForm(): RequirementForm {
  return {
    title: "Project Requirements",
    intro: "Tell us what you need so we can get building. The more detail, the better.",
    fields: [
      { id: uid(), label: "Project goals", type: "textarea", required: true, placeholder: "What does success look like?" },
      { id: uid(), label: "Target launch date", type: "date", required: false },
    ],
    sent: false,
    sentAt: null,
    responses: {},
    submittedAt: null,
  };
}

export function newProjectDoc(title: string, summary: string, clients: ProjectClient[]) {
  return {
    title,
    summary: summary || "",
    status: "active" as ProjectStatus,
    clients,
    stages: [] as ProjectStage[],
    payment: { total: 0, currency: "INR", milestones: [] as PaymentMilestone[] } as Payment,
    requirementForm: emptyForm(),
    portal: null as PortalAccess | null,
    members: [] as ProjectMember[],
    createdAt: serverTimestamp(),
  };
}

// Default access grant for a newly-assigned member — sees everything, read-only.
export function defaultMember(p: { id: string; kind: "team" | "client"; name: string; email: string }): ProjectMember {
  return { ...p, sections: [...ALL_SECTIONS], canWrite: p.kind === "team", hidePayments: false };
}

// ── Firestore ops ─────────────────────────────────────────────────────────

export async function createProject(title: string, summary: string, clients: ProjectClient[]) {
  const ref = await addDoc(collection(db, "projects"), newProjectDoc(title, summary, clients));
  await logAction("Created project", title);
  return ref.id;
}

export async function patchProject(id: string, data: Partial<Omit<Project, "id">>) {
  await updateDoc(doc(db, "projects", id), data as any);
}

export async function removeProject(id: string, title: string) {
  await deleteDoc(doc(db, "projects", id));
  await logAction("Deleted project", title);
}

// ── Stage comments (client ↔ team feedback) ─────────────────────────────────

export async function addStageComment(projectId: string, c: Omit<StageComment, "id">) {
  await addDoc(collection(db, "projects", projectId, "comments"), c);
}

export function streamStageComments(projectId: string, cb: (list: StageComment[]) => void) {
  const q = query(collection(db, "projects", projectId, "comments"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as StageComment[]),
    () => cb([]));
}

export async function removeStageComment(projectId: string, commentId: string) {
  await deleteDoc(doc(db, "projects", projectId, "comments", commentId));
}

import {
  collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp,
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

export interface ProjectStage {
  id: string;
  name: string;
  description?: string;
  status: StageStatus;
  completedAt?: number | null;
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
  createdAt?: any;
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
    createdAt: serverTimestamp(),
  };
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

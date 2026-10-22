import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// Everything the SealedExam server holds. There is no plaintext and no key in here:
// questions are Tide ciphertext, policies are network-signed bytes, the rest is metadata.
// Kept as a plain JSON file on purpose, so anyone can `cat data/store.json` and check.

export const PAPER_ID = "paper-math-2026";

export type AuditSource = "app" | "tidecloak" | "client-reported";

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  action: string;
  details?: string;
  source: AuditSource;
}

export interface QuestionItem {
  id: string;
  paperId: string;
  author: string;
  ciphertext: string;
  createdAt: string;
  status: "sealed";
}

export interface ReleaseRequest {
  id: string;
  paperId: string;
  site: string;
  requester: string;
  requesterUserId: string;
  createdAt: string;
  changeRequestIds: string[];
  // Quorum progress as last seen by a council member's browser (client-reported). It lets the
  // proctor, who cannot read TideCloak's change requests, see where the council is.
  progress?: { authCount: number | null; threshold: number | null; committed: boolean; reportedBy: string; at: string };
}

export interface Store {
  paper: {
    id: string;
    title: string;
    site: string;
    bellRungAt: string | null;
  };
  policies: {
    write: string | null;
    read: string | null;
    signedBy: string | null;
    signedAt: string | null;
  };
  questions: QuestionItem[];
  releaseRequests: ReleaseRequest[];
  audit: AuditEvent[];
}

const STORE_PATH = join(process.cwd(), "data", "store.json");

function empty(): Store {
  return {
    paper: {
      id: PAPER_ID,
      title: "Mathematics: National Graduation Exam 2026 (synthetic)",
      site: "Hanoi Council, Site A, Room 12 (fictional)",
      bellRungAt: null,
    },
    policies: { write: null, read: null, signedBy: null, signedAt: null },
    questions: [],
    releaseRequests: [],
    audit: [],
  };
}

export function readStore(): Store {
  if (!existsSync(STORE_PATH)) return empty();
  return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
}

export function updateStore<T>(fn: (s: Store) => T): T {
  const s = readStore();
  const out = fn(s);
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
  return out;
}

export function audit(
  s: Store,
  actor: string,
  action: string,
  details?: string,
  source: AuditSource = "app"
) {
  s.audit.push({ id: randomUUID(), ts: new Date().toISOString(), actor, action, details, source });
}

export const newId = () => randomUUID();

"use client";

// Browser -> TideCloak admin API, with the signed-in council member's OWN DPoP-bound token.
// Never proxied through the app server: TideCloak credits each approval to whoever made the HTTP
// call, so a proxy would record every human signature under one service identity (AP-89).
import tcConfig from "../../../data/tidecloak.json";

type SecureFetch = (url: string, init?: RequestInit) => Promise<Response>;
type ApproveTideRequests = (
  requests: { id: string; request: Uint8Array }[]
) => Promise<{ id: string; approved?: { request: Uint8Array }; denied?: boolean; pending?: boolean }[]>;

export interface ChangeRequest {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";
  requestedBy?: string;
  createdAt?: string | number;
  resolvedAt?: string | number;
  authorizationCount?: number;
  authorizers?: { username: string; timestamp: string | number }[];
  threshold?: number;
  readyToCommit?: boolean;
  rows?: unknown;
}

const base = () =>
  `${(tcConfig as any)["auth-server-url"].replace(/\/+$/, "")}/admin/realms/${(tcConfig as any).realm}`;

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`TideCloak ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

// A browser call to another origin that fails before any response is almost always CORS: the
// app's origin is missing from the client's Web Origins in TideCloak. Say so instead of "Failed to fetch".
async function call(sf: SecureFetch, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await sf(url, init);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        `Could not reach TideCloak from the browser (${err.message}). Check that ${window.location.origin} is in the client's Web Origins.`
      );
    }
    throw err;
  }
}

export async function listChangeRequests(sf: SecureFetch, status = "PENDING"): Promise<ChangeRequest[]> {
  const out = await json<ChangeRequest[]>(await call(sf, `${base()}/iga/change-requests?status=${status}`));
  return Array.isArray(out) ? out : [];
}

async function realmRole(sf: SecureFetch, name: string) {
  return json<any>(await call(sf, `${base()}/roles/${encodeURIComponent(name)}`));
}

/** A user's username, for labelling change requests. Falls back to the id. */
export async function userName(sf: SecureFetch, userId: string): Promise<string> {
  try {
    const u = await json<any>(await call(sf, `${base()}/users/${userId}`));
    return String(u?.username ?? userId);
  } catch {
    return userId;
  }
}

/**
 * Ask TideCloak to grant the release roles to a user. On an IGA realm this does NOT take effect:
 * it returns 202 and files a change request that needs the council quorum.
 */
export async function requestReleaseGrant(sf: SecureFetch, userId: string): Promise<{ status: number; changeRequestId: string | null }> {
  return changeReleaseRoles(sf, userId, "POST", "GRANT_ROLES");
}

/**
 * Ask TideCloak to take the release roles away again (to reset the demo). Also a change request
 * that needs the council quorum.
 */
export async function requestReleaseRevoke(sf: SecureFetch, userId: string): Promise<{ status: number; changeRequestId: string | null }> {
  return changeReleaseRoles(sf, userId, "DELETE", "REVOKE_ROLES");
}

async function changeReleaseRoles(sf: SecureFetch, userId: string, method: "POST" | "DELETE", actionType: string) {
  const roles = await Promise.all([realmRole(sf, "exam-releaser"), realmRole(sf, "_tide_decryptor")]);
  const res = await call(sf, `${base()}/users/${userId}/role-mappings/realm`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(roles),
  });
  if (res.status !== 202 && !res.ok) throw new Error(`TideCloak ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const loc = res.headers.get("Location");
  let changeRequestId = loc ? loc.split("/").pop() ?? null : null;
  if (!changeRequestId) {
    // Location may not be exposed over CORS: find the newest pending request for this user.
    // The revoke action name is not verified, so fall back to any pending request for the user.
    const forUser = (await listChangeRequests(sf)).filter((c) => JSON.stringify(c).includes(userId));
    const exact = forUser.filter((c) => c.actionType === actionType);
    const mine = exact.length ? exact : forUser;
    changeRequestId = mine.length ? mine[mine.length - 1].id : null;
  }
  return { status: res.status, changeRequestId };
}

const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesToB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};

export interface ApproveResult {
  mode: string;
  committed?: boolean;
  authCount?: number;
  threshold?: number;
  readyToCommit?: boolean;
  status?: string;
}

/**
 * Approve one change request. Tide MultiAdmin: the first call returns a requestModel, the council
 * member signs it in the Tide enclave popup, and the second call records the signature.
 * TideCloak commits by itself once the quorum is met.
 */
export async function approveChangeRequest(
  sf: SecureFetch,
  approveTideRequests: ApproveTideRequests,
  id: string
): Promise<ApproveResult> {
  const url = `${base()}/iga/change-requests/${id}/approve`;
  const post = (body: object) =>
    call(sf, url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const first = await json<any>(await post({}));
  if (first?.mode !== "needs-approval") return first;

  const [signed] = await approveTideRequests([{ id, request: b64ToBytes(first.requestModel) }]);
  if (!signed?.approved?.request) {
    throw new Error(signed?.denied ? "You declined in the Tide enclave" : "The Tide enclave returned no signature");
  }
  return json<ApproveResult>(await post({ requestModel: bytesToB64(signed.approved.request) }));
}

export async function denyChangeRequest(sf: SecureFetch, id: string, reason: string) {
  const res = await call(sf, `${base()}/iga/change-requests/${id}/deny`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`TideCloak ${res.status}`);
}

/** The realm's signed admin policy: authorises a council member to sign the paper policies. */
export async function fetchAdminPolicy(sf: SecureFetch): Promise<Uint8Array> {
  const out = await json<any>(await call(sf, `${base()}/iga/role-policies/name/tide-realm-admin`));
  if (!out?.policy) throw new Error("No tide-realm-admin policy found on the realm");
  return b64ToBytes(out.policy);
}

export const vendorId = () => String((tcConfig as any).vendorId ?? "");

/** Turn a network refusal into something a person can read. It is NOT an outage (AP-RA18). */
export function explainTideError(err: unknown): { refused: boolean; message: string } {
  const e = err as any;
  const parts = [e?.message, e?.cause?.message, typeof e?.cause === "string" ? e.cause : "", JSON.stringify(e?.cause ?? "")]
    .filter(Boolean)
    .join(" | ");
  const refused = /THRESHOLD_FAILURE|not found in doken|not found for this|not found in list of roles|subjectId does not match|Tags do not contain/i.test(parts);
  return {
    refused,
    message: refused ? `Refused by the Tide network. ${pickReason(parts)}` : String(e?.message ?? err),
  };
}

function pickReason(s: string): string {
  const m = s.match(/'[^']+' role not found[^.|"]*\.?|[^|"]*not found in list of roles\.?|subjectId does not match\.?|Tags do not contain assignmentId\.?/i);
  return m ? `Reason: ${m[0].trim()}` : "The caller does not hold the role the paper's policy requires.";
}

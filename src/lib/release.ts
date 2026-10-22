import type { ReleaseRequest } from "./store";

// Checks on what a council member's browser reports about a TideCloak change request.
//
// The app server cannot read /iga/change-requests itself: that needs manage-realm, and the server
// deliberately holds no TideCloak admin credential. So everything here is a consistency check on
// client-relayed data. It catches linking the wrong request (e.g. a self-grant for someone else),
// not a forged one. The decisive check is the proctor's own TideCloak-signed token (see
// /api/release-requests/confirm).

export const CHANGE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
export const MAX_LINKED_CHANGE_REQUESTS = 5;
const MAX_SNAPSHOT_BYTES = 20_000;
const MAX_AUTHORIZERS = 10;
const STATUSES = new Set(["PENDING", "APPROVED", "DENIED", "CANCELLED"]);

export interface ChangeRequestSnapshot {
  status: string | null;
  threshold: number | null;
  authorizers: { username: string; timestamp: string | number }[];
}

export type SnapshotCheck = { ok: true; snapshot: ChangeRequestSnapshot } | { ok: false; error: string };

export function checkChangeRequestSnapshot(
  raw: unknown,
  changeRequestId: string,
  request: ReleaseRequest
): SnapshotCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "changeRequest must be the object TideCloak returned" };
  }
  const json = JSON.stringify(raw);
  if (json.length > MAX_SNAPSHOT_BYTES) return { ok: false, error: "changeRequest is too large" };

  const cr = raw as Record<string, unknown>;
  if (cr.id !== changeRequestId) return { ok: false, error: "changeRequest.id does not match changeRequestId" };
  if (cr.actionType !== "GRANT_ROLES") {
    return { ok: false, error: `Expected a GRANT_ROLES change request, got ${String(cr.actionType)}` };
  }
  // TideCloak's row layout for a role grant is not pinned down, so match the requester's user id
  // anywhere in the request, the same way the browser helper finds it (src/lib/tide/iga.ts).
  if (cr.entityId !== request.requesterUserId && !json.includes(request.requesterUserId)) {
    return { ok: false, error: `This change request does not grant roles to ${request.requester}` };
  }

  const status = typeof cr.status === "string" && STATUSES.has(cr.status) ? cr.status : null;
  const threshold = typeof cr.threshold === "number" && Number.isFinite(cr.threshold) ? cr.threshold : null;

  const list = cr.authorizers ?? [];
  if (!Array.isArray(list) || list.length > MAX_AUTHORIZERS) {
    return { ok: false, error: "changeRequest.authorizers must be a short array" };
  }
  const authorizers: ChangeRequestSnapshot["authorizers"] = [];
  for (const a of list) {
    const username = (a as any)?.username;
    const timestamp = (a as any)?.timestamp;
    if (typeof username !== "string" || !username || username.length > 100) {
      return { ok: false, error: "Each authorizer needs a username" };
    }
    authorizers.push({
      username,
      timestamp: typeof timestamp === "number" || typeof timestamp === "string" ? timestamp : "",
    });
  }
  return { ok: true, snapshot: { status, threshold, authorizers } };
}

// The release request a proctor's grant belongs to: their newest one.
export function latestRequestFor(requests: ReleaseRequest[], userId: string): ReleaseRequest | undefined {
  return requests.filter((r) => r.requesterUserId === userId).at(-1);
}

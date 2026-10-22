import { withAccess, withAuth, withRealmRole } from "@/lib/auth/protect";
import { actorName, isCouncil } from "@/lib/auth/actor";
import { audit, newId, readStore, updateStore } from "@/lib/store";
import { CHANGE_REQUEST_ID, MAX_LINKED_CHANGE_REQUESTS, checkChangeRequestSnapshot } from "@/lib/release";

export const GET = withAuth(async () => {
  return Response.json({ releaseRequests: readStore().releaseRequests });
});

// The proctor asks the council to open the paper. App-level rule: only after the (mock) bell.
export const POST = withRealmRole("proctor", async (_req, jwt) => {
  const actor = actorName(jwt);
  const s = readStore();
  if (!s.paper.bellRungAt) {
    return Response.json({ error: "The exam bell has not rung yet (app rule)" }, { status: 409 });
  }
  const request = updateStore((st) => {
    const r = {
      id: newId(),
      paperId: st.paper.id,
      site: st.paper.site,
      requester: actor,
      requesterUserId: String(jwt.sub),
      createdAt: new Date().toISOString(),
      changeRequestIds: [] as string[],
      approvals: [],
      threshold: null,
      changeRequestStatus: null,
      grantConfirmedAt: null,
    };
    st.releaseRequests.push(r);
    audit(st, actor, "release_requested", `Asked the council to release ${st.paper.id} to ${actor}`);
    return r;
  });
  return Response.json({ request });
});

// A council member links the TideCloak change request they filed to the release request, and may
// relay the request as their browser read it from TideCloak (status, threshold, authorizers[]).
// All of it is client-reported: see src/lib/release.ts for what is checked and why.
export const PATCH = withAccess(isCouncil, async (req, jwt) => {
  const body = await req.json().catch(() => null);
  const { id, changeRequestId, changeRequest } = body ?? {};
  if (typeof id !== "string" || typeof changeRequestId !== "string" || !CHANGE_REQUEST_ID.test(changeRequestId)) {
    return Response.json({ error: "Expected { id, changeRequestId, changeRequest? }" }, { status: 400 });
  }
  const actor = actorName(jwt);
  const result = updateStore((s): { status: number; error?: string } => {
    const r = s.releaseRequests.find((x) => x.id === id);
    if (!r) return { status: 404, error: "Not found" };

    const isNew = !r.changeRequestIds.includes(changeRequestId);
    if (isNew && r.changeRequestIds.length >= MAX_LINKED_CHANGE_REQUESTS) {
      return { status: 409, error: "Too many change requests linked to this release request" };
    }
    const check = changeRequest === undefined ? null : checkChangeRequestSnapshot(changeRequest, changeRequestId, r);
    if (check && !check.ok) return { status: 422, error: check.error };

    const cr = changeRequestId.slice(0, 8);
    if (isNew) {
      r.changeRequestIds.push(changeRequestId);
      audit(s, actor, "role_grant_filed", `Reported TideCloak change request ${cr} granting exam-releaser to ${r.requester}`, "client-reported");
    }
    if (check?.ok) {
      const approvals = (r.approvals ??= []);
      for (const a of check.snapshot.authorizers) {
        if (approvals.some((x) => x.username === a.username)) continue;
        approvals.push({ ...a, reportedBy: actor });
        audit(s, a.username, "approval_recorded", `Approved change request ${cr} (per TideCloak authorizers, relayed by ${actor})`, "client-reported");
      }
      r.threshold = check.snapshot.threshold;
      r.changeRequestStatus = check.snapshot.status;
    }
    return { status: 200 };
  });
  return result.status === 200
    ? Response.json({ ok: true })
    : Response.json({ error: result.error }, { status: result.status });
});

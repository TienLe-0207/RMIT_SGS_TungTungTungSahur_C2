import { withAuth, withRole } from "@/lib/auth/protect";
import { actorName, isCouncil } from "@/lib/auth/actor";
import { audit, newId, readStore, updateStore } from "@/lib/store";

export const GET = withAuth(async () => {
  return Response.json({ releaseRequests: readStore().releaseRequests });
});

// The proctor asks the council to open the paper. App-level rule: only after the (mock) bell.
export const POST = withRole("proctor", async (_req, jwt) => {
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
    };
    st.releaseRequests.push(r);
    audit(st, actor, "release_requested", `Asked the council to release ${st.paper.id} to ${actor}`);
    return r;
  });
  return Response.json({ request });
});

// A council member links the TideCloak change request they filed to the release request, or
// reports the quorum progress their browser read from TideCloak (optional `progress`).
export const PATCH = withAuth(async (req, jwt) => {
  if (!isCouncil(jwt)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const { id, changeRequestId, progress } = body ?? {};
  if (typeof id !== "string" || typeof changeRequestId !== "string") {
    return Response.json({ error: "Expected { id, changeRequestId, progress? }" }, { status: 400 });
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const actor = actorName(jwt);
  const ok = updateStore((s) => {
    const r = s.releaseRequests.find((x) => x.id === id);
    if (!r) return false;
    if (!r.changeRequestIds.includes(changeRequestId)) {
      r.changeRequestIds.push(changeRequestId);
      audit(s, actor, "role_grant_filed", `Filed TideCloak change request ${changeRequestId.slice(0, 8)} granting exam-releaser to ${r.requester}`);
    }
    if (progress && typeof progress === "object") {
      r.progress = {
        authCount: num(progress.authCount),
        threshold: num(progress.threshold),
        committed: progress.committed === true,
        reportedBy: actor,
        at: new Date().toISOString(),
      };
    }
    return true;
  });
  return ok ? Response.json({ ok }) : Response.json({ error: "Not found" }, { status: 404 });
});

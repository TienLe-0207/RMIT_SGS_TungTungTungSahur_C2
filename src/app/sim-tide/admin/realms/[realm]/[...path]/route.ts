import type { NextRequest } from "next/server";
import type { JWTPayload } from "jose";
import { withAccess } from "@/lib/auth/protect";
import { isCouncil } from "@/lib/auth/actor";
import {
  COUNCIL_ROLE, newId, readSim, threshold, updateSim, type SimChangeRequest, type SimState,
} from "@/lib/sim-tide/state";

// SIMULATED TideCloak admin API, the subset SealedExam calls from a council member's browser
// (src/lib/tide/iga.ts). Same paths and shapes as TideCloak's IGA endpoints. Every role grant is a
// change request; it commits only when `threshold` distinct council members have signed it.

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });
const route = (req: NextRequest) => req.nextUrl.pathname.replace(/^.*\/admin\/realms\/[^/]+\//, "").split("/");
const who = (jwt: JWTPayload) => String((jwt as any).preferred_username);

function view(s: SimState, cr: SimChangeRequest) {
  return { ...cr, threshold: threshold(s), authorizationCount: cr.authorizers.length, readyToCommit: cr.authorizers.length >= threshold(s) };
}

// Apply a committed change request to the user, as TideCloak does once the quorum is met.
function commitIfReady(s: SimState, cr: SimChangeRequest) {
  if (cr.status !== "PENDING" || cr.authorizers.length < threshold(s)) return false;
  const u = s.users.find((x) => x.id === cr.entityId);
  if (u) {
    u.realmRoles =
      cr.actionType === "GRANT_ROLES"
        ? [...new Set([...u.realmRoles, ...cr.roles])]
        : u.realmRoles.filter((r) => !cr.roles.includes(r));
  }
  cr.status = "APPROVED";
  cr.resolvedAt = new Date().toISOString();
  return true;
}

export const GET = withAccess(isCouncil, async (req) => {
  const s = readSim();
  const [a, b, c] = route(req);
  if (a === "iga" && b === "change-requests") {
    const status = req.nextUrl.searchParams.get("status") ?? "PENDING";
    return json(s.changeRequests.filter((cr) => cr.status === status).map((cr) => view(s, cr)));
  }
  if (a === "iga" && b === "role-policies" && c === "name") {
    // Stand-in for the realm's signed admin policy. The simulated network checks the caller's
    // council role itself, so this value only keeps the browser flow the same as the real one.
    return json({ policy: Buffer.from(`simulated-admin-policy:${COUNCIL_ROLE}`).toString("base64") });
  }
  if (a === "roles" && b) return json({ id: `role-${b}`, name: decodeURIComponent(b) });
  if (a === "users" && b && !c) {
    const u = s.users.find((x) => x.id === b);
    return u ? json({ id: u.id, username: u.username }) : json({ error: "User not found" }, 404);
  }
  return json({ error: "Not simulated" }, 404);
});

async function roleMapping(req: NextRequest, jwt: JWTPayload, actionType: SimChangeRequest["actionType"]) {
  const [, userId] = route(req);
  const body = await req.json().catch(() => []);
  const roles = Array.isArray(body) ? body.map((r: any) => String(r?.name)) : [];
  if (!roles.length) return json({ error: "Expected an array of roles" }, 400);
  const result = updateSim((s) => {
    if (!s.users.some((u) => u.id === userId)) return { status: 404 as const };
    const open = s.changeRequests.find((cr) => cr.status === "PENDING" && cr.entityId === userId);
    if (open) return { status: 409 as const, id: open.id };
    // Filing counts as the filer's approval. It still cannot commit alone while threshold > 1.
    const now = new Date().toISOString();
    const cr: SimChangeRequest = {
      id: newId(), entityType: "USER", entityId: userId, actionType, roles, status: "PENDING",
      requestedBy: who(jwt), createdAt: now, authorizers: [{ username: who(jwt), timestamp: now }],
      threshold: threshold(s), authorizationCount: 1,
    };
    s.changeRequests.push(cr);
    commitIfReady(s, cr);
    return { status: 202 as const, id: cr.id };
  });
  if (result.status === 404) return json({ error: "User not found" }, 404);
  if (result.status === 409) return json({ error: "PENDING_CHANGE_REQUEST_CONFLICT", conflictingChangeRequestId: result.id }, 409);
  return new Response(null, { status: 202, headers: { Location: `${req.nextUrl.pathname.split("/users/")[0]}/iga/change-requests/${result.id}` } });
}

export const POST = withAccess(isCouncil, async (req, jwt) => {
  const [a, b, c, d] = route(req);
  if (a === "users" && c === "role-mappings" && d === "realm") return roleMapping(req, jwt, "GRANT_ROLES");
  if (a !== "iga" || b !== "change-requests" || !c) return json({ error: "Not simulated" }, 404);
  const me = who(jwt);
  const body = await req.json().catch(() => ({}));

  if (d === "deny") {
    const ok = updateSim((s) => {
      const cr = s.changeRequests.find((x) => x.id === c && x.status === "PENDING");
      if (!cr) return false;
      cr.status = "DENIED";
      cr.resolvedAt = new Date().toISOString();
      return true;
    });
    return ok ? json({ ok: true }) : json({ error: "Not found" }, 404);
  }
  if (d !== "approve") return json({ error: "Not simulated" }, 404);

  // Two phases, like TideCloak: the first call returns the request to sign in the enclave, the
  // second carries the signed request back. The simulated enclave's "signature" is the echoed model.
  if (!body?.requestModel) {
    const s = readSim();
    const cr = s.changeRequests.find((x) => x.id === c);
    if (!cr) return json({ error: "Not found" }, 404);
    if (cr.status !== "PENDING" || cr.authorizers.some((x) => x.username === me)) {
      return json({ mode: "already-recorded", committed: cr.status === "APPROVED", authCount: cr.authorizers.length, threshold: threshold(s), status: cr.status });
    }
    const model = { changeRequestId: cr.id, approver: me, roles: cr.roles, nonce: newId() };
    return json({ mode: "needs-approval", requestModel: Buffer.from(JSON.stringify(model)).toString("base64") });
  }

  let model: any;
  try {
    model = JSON.parse(Buffer.from(String(body.requestModel), "base64").toString("utf-8"));
  } catch {
    return json({ error: "Malformed requestModel" }, 400);
  }
  if (model?.changeRequestId !== c || model?.approver !== me) return json({ error: "Signed request does not match this approver" }, 403);
  const out = updateSim((s) => {
    const cr = s.changeRequests.find((x) => x.id === c);
    if (!cr || cr.status !== "PENDING") return null;
    if (!cr.authorizers.some((x) => x.username === me)) cr.authorizers.push({ username: me, timestamp: new Date().toISOString() });
    const committed = commitIfReady(s, cr);
    return { mode: "recorded", committed, authCount: cr.authorizers.length, threshold: threshold(s), status: cr.status };
  });
  return out ? json(out) : json({ error: "Change request is not pending" }, 409);
});

export const DELETE = withAccess(isCouncil, async (req, jwt) => {
  const [a, , c, d] = route(req);
  if (a === "users" && c === "role-mappings" && d === "realm") return roleMapping(req, jwt, "REVOKE_ROLES");
  return json({ error: "Not simulated" }, 404);
});

export const dynamic = "force-dynamic";

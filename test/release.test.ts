import { beforeEach, describe, expect, it } from "vitest";
import { call, login, personas, resetStore, type User } from "./helpers";
import { POST as ringBell } from "@/app/api/bell/route";
import { PATCH as linkChangeRequest, POST as requestRelease } from "@/app/api/release-requests/route";
import { POST as confirmGrant } from "@/app/api/release-requests/confirm/route";
import { readStore } from "@/lib/store";

// Item 6: what the audit trail may claim TideCloak confirmed, and what is only client-reported.

type Handler = (req: any) => Promise<Response>;

async function as(user: User, handler: Handler, method: string, path: string, body?: unknown) {
  return handler(await call(await login(user), method, path, body));
}

const CR_ID = "3f1c2a9e-0000-4000-8000-000000000001";

// Nam after the quorum committed and he refreshed his session.
const namGranted: User = { username: "nam", realmRoles: ["proctor", "exam-releaser", "_tide_decryptor"] };

async function openRequest() {
  await as(personas.nam, ringBell, "POST", "/api/bell");
  const { request } = await (await as(personas.nam, requestRelease, "POST", "/api/release-requests")).json();
  return request as { id: string; requesterUserId: string };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: CR_ID,
    entityType: "USER",
    entityId: "user-nam",
    actionType: "GRANT_ROLES",
    status: "APPROVED",
    threshold: 2,
    authorizationCount: 2,
    authorizers: [
      { username: "minh", timestamp: 1792652400000 },
      { username: "hoa", timestamp: 1792652460000 },
    ],
    ...overrides,
  };
}

const auditOf = (action: string) => readStore().audit.filter((e) => e.action === action);

beforeEach(resetStore);

describe("POST /api/release-requests/confirm", () => {
  it("answers 409 while the proctor's token does not carry the release roles", async () => {
    await openRequest();
    const res = await as(personas.nam, confirmGrant, "POST", "/api/release-requests/confirm");
    expect(res.status).toBe(409);
    expect((await res.json()).effective).toBe(false);
    expect(readStore().releaseRequests[0].grantConfirmedAt).toBeNull();
    expect(auditOf("release_granted")).toHaveLength(0);
  });

  it("does not count release roles held as client roles", async () => {
    await openRequest();
    const fake: User = { username: "nam", realmRoles: ["proctor"], clientRoles: { "sealedexam-app": ["exam-releaser", "_tide_decryptor"] } };
    expect((await as(fake, confirmGrant, "POST", "/api/release-requests/confirm")).status).toBe(409);
  });

  it("needs both release roles, not just exam-releaser", async () => {
    await openRequest();
    const half: User = { username: "nam", realmRoles: ["proctor", "exam-releaser"] };
    expect((await as(half, confirmGrant, "POST", "/api/release-requests/confirm")).status).toBe(409);
  });

  it("refuses anyone who is not a proctor", async () => {
    const minhGranted: User = { username: "minh", realmRoles: ["exam-releaser", "_tide_decryptor"] };
    expect((await as(minhGranted, confirmGrant, "POST", "/api/release-requests/confirm")).status).toBe(403);
  });

  it("records the grant as TideCloak-confirmed, once", async () => {
    const request = await openRequest();
    const res = await as(namGranted, confirmGrant, "POST", "/api/release-requests/confirm");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.effective).toBe(true);
    expect(body.request).toMatchObject({ id: request.id, requester: "nam" });
    expect(typeof body.request.grantConfirmedAt).toBe("string");

    const events = auditOf("release_granted");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor: "nam", source: "tidecloak" });
    expect(events[0].details).toContain(request.id.slice(0, 8));

    await as(namGranted, confirmGrant, "POST", "/api/release-requests/confirm");
    expect(auditOf("release_granted")).toHaveLength(1);
  });

  it("flags release roles that arrived without any release request, once", async () => {
    const res = await as(namGranted, confirmGrant, "POST", "/api/release-requests/confirm");
    expect(res.status).toBe(200);
    expect((await res.json()).request).toBeNull();
    await as(namGranted, confirmGrant, "POST", "/api/release-requests/confirm");
    const events = auditOf("release_granted");
    expect(events).toHaveLength(1);
    expect(events[0].details).toContain("NO release request");
  });
});

describe("PATCH /api/release-requests (link a change request)", () => {
  it("labels the link as client-reported", async () => {
    const request = await openRequest();
    const res = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", { id: request.id, changeRequestId: CR_ID });
    expect(res.status).toBe(200);
    expect(auditOf("role_grant_filed")).toEqual([expect.objectContaining({ actor: "minh", source: "client-reported" })]);
  });

  it("rejects a malformed change request id", async () => {
    const request = await openRequest();
    for (const changeRequestId of ["", "short", "x".repeat(65), "../../etc", "id with spaces"]) {
      const res = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", { id: request.id, changeRequestId });
      expect(res.status).toBe(400);
    }
    expect(readStore().releaseRequests[0].changeRequestIds).toEqual([]);
  });

  it("answers 404 for an unknown release request", async () => {
    const res = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", { id: "nope", changeRequestId: CR_ID });
    expect(res.status).toBe(404);
  });

  it("refuses a change request that grants roles to someone else", async () => {
    const request = await openRequest();
    // e.g. Minh's own self-grant, linked to Nam's release request
    const body = { id: request.id, changeRequestId: CR_ID, changeRequest: snapshot({ entityId: "user-minh" }) };
    const res = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", body);
    expect(res.status).toBe(422);
    expect(readStore().releaseRequests[0].changeRequestIds).toEqual([]);
    expect(auditOf("role_grant_filed")).toHaveLength(0);
  });

  it("refuses a change request that is not a role grant, or has another id", async () => {
    const request = await openRequest();
    for (const changeRequest of [snapshot({ actionType: "DELETE_REALM" }), snapshot({ id: "aaaaaaaa-other" }), "not-an-object", [snapshot()]]) {
      const res = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", { id: request.id, changeRequestId: CR_ID, changeRequest });
      expect(res.status).toBe(422);
    }
  });

  it("refuses malformed authorizers", async () => {
    const request = await openRequest();
    for (const authorizers of ["minh", [{ timestamp: 1 }], Array.from({ length: 11 }, (_, i) => ({ username: `u${i}`, timestamp: i }))]) {
      const res = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", {
        id: request.id, changeRequestId: CR_ID, changeRequest: snapshot({ authorizers }),
      });
      expect(res.status).toBe(422);
    }
  });

  it("records relayed approvers once each, as client-reported", async () => {
    const request = await openRequest();
    const body = { id: request.id, changeRequestId: CR_ID, changeRequest: snapshot() };
    expect((await as(personas.hoa, linkChangeRequest, "PATCH", "/api/release-requests", body)).status).toBe(200);
    expect((await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", body)).status).toBe(200);

    const r = readStore().releaseRequests[0];
    expect(r.approvals?.map((a) => [a.username, a.reportedBy])).toEqual([["minh", "hoa"], ["hoa", "hoa"]]);
    expect(r).toMatchObject({ threshold: 2, changeRequestStatus: "APPROVED", changeRequestIds: [CR_ID] });

    const approvals = auditOf("approval_recorded");
    expect(approvals.map((e) => e.actor)).toEqual(["minh", "hoa"]);
    expect(approvals.every((e) => e.source === "client-reported")).toBe(true);
    expect(auditOf("role_grant_filed")).toHaveLength(1);
  });

  it("caps how many change requests one release request can collect", async () => {
    const request = await openRequest();
    for (let i = 1; i <= 5; i++) {
      const changeRequestId = `3f1c2a9e-0000-4000-8000-00000000000${i}`;
      expect((await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", { id: request.id, changeRequestId })).status).toBe(200);
    }
    const sixth = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", { id: request.id, changeRequestId: "3f1c2a9e-0000-4000-8000-000000000006" });
    expect(sixth.status).toBe(409);
  });
});

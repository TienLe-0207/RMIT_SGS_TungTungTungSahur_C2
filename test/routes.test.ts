import { beforeEach, describe, expect, it } from "vitest";
import { call, login, personas, resetStore, type User } from "./helpers";
import { POST as postQuestions } from "@/app/api/questions/route";
import { POST as postPolicies } from "@/app/api/policies/route";
import { POST as ringBell } from "@/app/api/bell/route";
import { GET as getVault } from "@/app/api/vault/route";
import {
  GET as listReleaseRequests,
  PATCH as linkChangeRequest,
  POST as requestRelease,
} from "@/app/api/release-requests/route";
import { readStore } from "@/lib/store";

// Authorization per route, with real tokens and proofs. Each case checks the status code, and the
// happy paths also check the response body keeps its current shape.

type Handler = (req: any) => Promise<Response>;

async function as(user: User, handler: Handler, method: string, path: string, body?: unknown) {
  return handler(await call(await login(user), method, path, body));
}

// Same role name, wrong place: on another client, or as a realm role.
const fakeCouncilClient: User = { username: "mallory", clientRoles: { "evil-client": ["tide-realm-admin"] } };
const fakeCouncilRealm: User = { username: "mallory", realmRoles: ["tide-realm-admin"] };
const proctorAsClientRole: User = { username: "mallory", clientRoles: { "sealedexam-app": ["proctor"] } };

const POLICY = { kind: "read", policy: "AAECAwQ=" };

beforeEach(resetStore);

describe("POST /api/questions", () => {
  it("lets a setter seal ciphertext and returns the new ids", async () => {
    const res = await as(personas.linh, postQuestions, "POST", "/api/questions", { ciphertexts: ["c1", "c2"] });
    expect(res.status).toBe(200);
    const { ids } = await res.json();
    expect(ids).toHaveLength(2);
    expect(readStore().questions.map((q) => q.ciphertext)).toEqual(["c1", "c2"]);
  });

  it("refuses a proctor", async () => {
    const res = await as(personas.nam, postQuestions, "POST", "/api/questions", { ciphertexts: ["c1"] });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/policies", () => {
  it("lets a council member store a policy", async () => {
    const res = await as(personas.minh, postPolicies, "POST", "/api/policies", POLICY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(readStore().policies).toMatchObject({ read: POLICY.policy, signedBy: "minh" });
  });

  it("refuses a setter", async () => {
    const res = await as(personas.linh, postPolicies, "POST", "/api/policies", POLICY);
    expect(res.status).toBe(403);
    expect(readStore().policies.read).toBeNull();
  });

  it("refuses tide-realm-admin on a client other than realm-management", async () => {
    expect((await as(fakeCouncilClient, postPolicies, "POST", "/api/policies", POLICY)).status).toBe(403);
  });

  it("refuses a realm role named tide-realm-admin", async () => {
    expect((await as(fakeCouncilRealm, postPolicies, "POST", "/api/policies", POLICY)).status).toBe(403);
  });
});

describe("GET /api/vault", () => {
  it("lets the IT operator see the raw store", async () => {
    const res = await as(personas.quang, getVault, "GET", "/api/vault");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["audit", "paper", "policies", "questions", "releaseRequests"]);
    expect(body.audit.at(-1)).toMatchObject({ actor: "quang", action: "operator_viewed" });
  });

  it("lets a council member see the raw store", async () => {
    expect((await as(personas.minh, getVault, "GET", "/api/vault")).status).toBe(200);
  });

  it("refuses a setter, a proctor and a fake council member", async () => {
    for (const u of [personas.linh, personas.nam, fakeCouncilClient]) {
      expect((await as(u, getVault, "GET", "/api/vault")).status).toBe(403);
    }
  });
});

describe("release flow", () => {
  it("refuses a release request before the mock bell", async () => {
    const res = await as(personas.nam, requestRelease, "POST", "/api/release-requests");
    expect(res.status).toBe(409);
    expect(readStore().releaseRequests).toHaveLength(0);
  });

  it("accepts a release request after the proctor rings the bell", async () => {
    const bell = await as(personas.nam, ringBell, "POST", "/api/bell");
    expect(bell.status).toBe(200);
    expect(typeof (await bell.json()).bellRungAt).toBe("string");

    const res = await as(personas.nam, requestRelease, "POST", "/api/release-requests");
    expect(res.status).toBe(200);
    const { request } = await res.json();
    expect(request).toMatchObject({ paperId: "paper-math-2026", requester: "nam", changeRequestIds: [] });

    const list = await as(personas.hoa, listReleaseRequests, "GET", "/api/release-requests");
    expect((await list.json()).releaseRequests).toHaveLength(1);
  });

  it("only lets a realm-role proctor ring the bell or ask for release", async () => {
    for (const u of [personas.linh, personas.minh, proctorAsClientRole]) {
      expect((await as(u, ringBell, "POST", "/api/bell")).status).toBe(403);
    }
    await as(personas.nam, ringBell, "POST", "/api/bell");
    for (const u of [personas.linh, personas.minh, proctorAsClientRole]) {
      expect((await as(u, requestRelease, "POST", "/api/release-requests")).status).toBe(403);
    }
  });

  it("only lets a real council member link a change request", async () => {
    await as(personas.nam, ringBell, "POST", "/api/bell");
    const { request } = await (await as(personas.nam, requestRelease, "POST", "/api/release-requests")).json();
    const body = { id: request.id, changeRequestId: "3f1c2a9e-0000-4000-8000-000000000001" };

    for (const u of [fakeCouncilClient, fakeCouncilRealm, personas.nam]) {
      expect((await as(u, linkChangeRequest, "PATCH", "/api/release-requests", body)).status).toBe(403);
    }
    const res = await as(personas.minh, linkChangeRequest, "PATCH", "/api/release-requests", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(readStore().releaseRequests[0].changeRequestIds).toEqual(["3f1c2a9e-0000-4000-8000-000000000001"]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair } from "jose";
import { call, dpopProof, login, newDpopKey, personas, request, resetStore } from "./helpers";
import { GET as getPaper } from "@/app/api/paper/route";

// Authentication (withAuth): signature, issuer, client, expiry and the DPoP binding.
// GET /api/paper is used because it needs a valid session and nothing else.

const PATH = "/api/paper";

async function status(req: Request) {
  return (await getPaper(req as any)).status;
}

beforeEach(resetStore);

describe("withAuth", () => {
  it("accepts a valid DPoP-bound request and keeps the response shape", async () => {
    const s = await login(personas.nam);
    const res = await getPaper((await call(s, "GET", PATH)) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["paper", "policies", "questions"]);
    expect(body.paper.id).toBe("paper-math-2026");
  });

  it("rejects a request with no Authorization header", async () => {
    expect(await status(request("GET", PATH, {}))).toBe(401);
  });

  it("rejects a token that is not a JWT", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof({ ...s, token: "not-a-jwt" }, "GET", PATH);
    expect(await status(request("GET", PATH, { authorization: "DPoP not-a-jwt", dpop: proof }))).toBe(401);
  });

  it("rejects a token signed by a key that is not the realm's", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const s = await login(personas.nam, { signingKey: privateKey });
    expect(await status(await call(s, "GET", PATH))).toBe(401);
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const s = await login(personas.nam, { iat: now - 600, exp: now - 60 });
    expect(await status(await call(s, "GET", PATH))).toBe(401);
  });

  it("rejects a token from another issuer", async () => {
    const s = await login(personas.nam, { issuer: "http://localhost:8080/realms/other" });
    expect(await status(await call(s, "GET", PATH))).toBe(401);
  });

  it("rejects a token issued to another client (azp)", async () => {
    const s = await login(personas.nam, { azp: "some-other-app" });
    expect(await status(await call(s, "GET", PATH))).toBe(401);
  });
});

describe("DPoP binding", () => {
  it("rejects a token without cnf.jkt (not sender-constrained)", async () => {
    const s = await login(personas.nam, { cnf: undefined });
    expect(await status(await call(s, "GET", PATH))).toBe(401);
  });

  it("rejects a bound token sent with the Bearer scheme, even with a proof", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof(s, "GET", PATH);
    expect(await status(request("GET", PATH, { authorization: `Bearer ${s.token}`, dpop: proof }))).toBe(401);
  });

  it("rejects a DPoP request without a proof header", async () => {
    const s = await login(personas.nam);
    expect(await status(request("GET", PATH, { authorization: `DPoP ${s.token}` }))).toBe(401);
  });

  it("rejects a proof signed by a key other than the one in cnf.jkt", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof(s, "GET", PATH, { key: await newDpopKey() });
    expect(await status(request("GET", PATH, { authorization: `DPoP ${s.token}`, dpop: proof }))).toBe(401);
  });

  it("rejects a proof made for another access token (ath)", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof(s, "GET", PATH, { ath: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    expect(await status(request("GET", PATH, { authorization: `DPoP ${s.token}`, dpop: proof }))).toBe(401);
  });

  it("rejects a proof made for another method", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof(s, "POST", PATH);
    expect(await status(request("GET", PATH, { authorization: `DPoP ${s.token}`, dpop: proof }))).toBe(401);
  });

  it("rejects a proof made for another URL", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof(s, "GET", "/api/vault");
    expect(await status(request("GET", PATH, { authorization: `DPoP ${s.token}`, dpop: proof }))).toBe(401);
  });

  it("rejects a stale proof (iat outside the window)", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof(s, "GET", PATH, { iat: Math.floor(Date.now() / 1000) - 3600 });
    expect(await status(request("GET", PATH, { authorization: `DPoP ${s.token}`, dpop: proof }))).toBe(401);
  });

  it("rejects a replayed proof (same jti twice)", async () => {
    const s = await login(personas.nam);
    const proof = await dpopProof(s, "GET", PATH);
    const headers = { authorization: `DPoP ${s.token}`, dpop: proof };
    expect(await status(request("GET", PATH, headers))).toBe(200);
    expect(await status(request("GET", PATH, headers))).toBe(401);
  });
});

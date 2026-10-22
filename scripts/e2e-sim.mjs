// End-to-end run of the demo story against a RUNNING app in simulated-TideCloak mode.
//
//   npm run sim:init && npm run dev      (in one terminal)
//   npm run e2e:sim                      (in another; BASE_URL defaults to http://localhost:3000)
//
// Every persona gets its own DPoP key and a token from /sim-tide/token, and every call carries a
// fresh DPoP proof, so this goes through the same verifyTideJWT + verifyDpop path as the browser.
// Each step checks the refusals as well as the happy path. Run `npm run sim:init` again before a
// second run: the story assumes a fresh realm and store.
import { randomUUID, createHash } from "crypto";
import { SignJWT, decodeJwt, exportJWK, generateKeyPair } from "jose";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

function check(ok, label, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `  -> ${detail}` : ""}`);
  if (!ok) failures++;
}
const section = (t) => console.log(`\n${t}`);

async function signIn(username) {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  const res = await fetch(`${BASE}/sim-tide/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, jwk }),
  });
  if (!res.ok) throw new Error(`sign-in ${username}: HTTP ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return { username, token: access_token, privateKey, jwk, sub: decodeJwt(access_token).sub, claims: decodeJwt(access_token) };
}

// "Refresh session": same DPoP key, roles read fresh from the realm.
async function refresh(s) {
  const res = await fetch(`${BASE}/sim-tide/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: s.username, jwk: s.jwk }),
  });
  const { access_token } = await res.json();
  return { ...s, token: access_token, claims: decodeJwt(access_token) };
}

async function proof(s, method, url) {
  const ath = createHash("sha256").update(s.token).digest("base64url");
  const u = new URL(url);
  return new SignJWT({ jti: randomUUID(), htm: method, htu: `${u.origin}${u.pathname}`, iat: Math.floor(Date.now() / 1000), ath })
    .setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: s.jwk })
    .sign(s.privateKey);
}

async function call(s, method, path, body, { scheme = "DPoP", withProof = true } = {}) {
  const url = `${BASE}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (s) {
    headers.Authorization = `${scheme} ${s.token}`;
    if (withProof) headers.DPoP = await proof(s, method, url);
  }
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

const realmRoles = (s) => s.claims.realm_access?.roles ?? [];
const IGA = "/sim-tide/admin/realms/sealedexam";
const QUESTIONS = [
  { q: "2 + 2 = ?", options: ["3", "4", "5", "6"], answer: 1 },
  { q: "Thủ đô của Việt Nam?", options: ["Huế", "Đà Nẵng", "Hà Nội", "TP.HCM"], answer: 2 },
];

// ---------------------------------------------------------------------------------------------
section("F1  Sign-in: DPoP-bound tokens, and the server refuses anything else");
const [linh, minh, hoa, tuan, quang] = await Promise.all(["linh", "minh", "hoa", "tuan", "quang"].map(signIn));
let nam = await signIn("nam");
check(Boolean(nam.claims.cnf?.jkt), "token is sender-constrained (cnf.jkt present)");
check((await call(quang, "GET", "/api/paper")).status === 200, "signed-in user with a valid DPoP proof gets 200");
check((await call(null, "GET", "/api/paper")).status === 401, "no token -> 401");
check((await call(quang, "GET", "/api/paper", undefined, { scheme: "Bearer", withProof: false })).status === 401, "token replayed as Bearer without proof -> 401");
const stolen = { ...quang, privateKey: linh.privateKey, jwk: linh.jwk };
check((await call(stolen, "GET", "/api/paper")).status === 401, "token presented with someone else's DPoP key -> 401");

const paper = (await call(quang, "GET", "/api/paper")).json;
const PAPER_ID = paper?.paper?.id;
check(typeof PAPER_ID === "string", `paper id read from the server (${PAPER_ID})`);

// ---------------------------------------------------------------------------------------------
section("F2  Council signs the two RelationshipAttestation policies");
const sign = (s, subjectId, access) => call(s, "POST", "/sim-tide/network/sign-policy", { subjectId, recordId: PAPER_ID, access });
check((await sign(linh, "exam-setter", "write")).status === 403, "a setter cannot get a policy signed by the network");
const writePol = (await sign(minh, "exam-setter", "write")).json?.policy;
const readPol = (await sign(minh, "exam-releaser", "read")).json?.policy;
check(Boolean(writePol && readPol), "council member gets write + read policies signed");
check((await call(linh, "POST", "/api/policies", { kind: "write", policy: writePol })).status === 403, "non-council cannot store a policy (403)");
check((await call(minh, "POST", "/api/policies", { kind: "write", policy: writePol })).status === 200, "council stores the write policy");
check((await call(minh, "POST", "/api/policies", { kind: "read", policy: readPol })).status === 200, "council stores the read policy");

// ---------------------------------------------------------------------------------------------
section("F3  Setter seals questions; nobody else can, and the setter cannot reopen them");
const items = QUESTIONS.map((q) => ({ data: JSON.stringify(q), tags: [PAPER_ID] }));
const enc = await call(linh, "POST", "/sim-tide/network/encrypt", { items, policy: writePol });
check(enc.status === 200 && enc.json?.items?.length === QUESTIONS.length, "setter encrypts through the network", enc.text);
const ciphertexts = enc.json?.items ?? [];
check(!ciphertexts.some((c) => c.includes("Việt Nam") || c.includes("2 + 2")), "ciphertext contains no plaintext");
check((await call(linh, "POST", "/api/questions", { ciphertexts })).status === 200, "setter hands in ciphertext");
check((await call(nam, "POST", "/api/questions", { ciphertexts })).status === 403, "proctor cannot submit questions (403)");
check((await call(nam, "POST", "/sim-tide/network/encrypt", { items, policy: writePol })).status === 403, "proctor cannot encrypt into the paper (network refuses)");
check((await call(linh, "POST", "/sim-tide/network/decrypt", { items: ciphertexts.map((e) => ({ encrypted: e, tags: [PAPER_ID] })), policy: readPol })).status === 403, "setter cannot decrypt their own sealed questions");
const extraTag = await call(linh, "POST", "/sim-tide/network/encrypt", { items: [{ data: "x", tags: [PAPER_ID, "other"] }], policy: writePol });
check(extraTag.status === 403, "a second tag on a record is refused (one paper, one tag)");
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(readPol, "base64").toString()), subjectId: "proctor" })).toString("base64");
check((await call(nam, "POST", "/sim-tide/network/decrypt", { items: [{ encrypted: ciphertexts[0], tags: [PAPER_ID] }], policy: forged })).status === 403, "an edited (unsigned) policy is refused");

// ---------------------------------------------------------------------------------------------
section("F4  Operator sees everything stored, opens nothing");
const vault = await call(quang, "GET", "/api/vault");
check(vault.status === 200, "IT operator can read the raw vault");
check(!vault.text.includes("Việt Nam") && !vault.text.includes("2 + 2"), "vault holds no plaintext");
const decIn = (s) => call(s, "POST", "/sim-tide/network/decrypt", { items: ciphertexts.map((e) => ({ encrypted: e, tags: [PAPER_ID] })), policy: readPol });
check((await decIn(quang)).status === 403, "operator cannot decrypt");

// ---------------------------------------------------------------------------------------------
section("F5  A council member tries to grant themselves release rights");
const releaseRoles = [{ name: "exam-releaser" }, { name: "_tide_decryptor" }];
const self = await call(minh, "POST", `${IGA}/users/${minh.sub}/role-mappings/realm`, releaseRoles);
check(self.status === 202, "self-grant is captured as a change request (202), not applied", `${self.status} ${self.text}`);
const selfCr = (await call(minh, "GET", `${IGA}/iga/change-requests?status=PENDING`)).json?.find((c) => c.entityId === minh.sub);
check(selfCr?.authorizationCount === 1 && selfCr?.threshold === 2 && selfCr?.readyToCommit === false, "it has 1 of 2 approvals and cannot commit alone", JSON.stringify(selfCr));
const again = await call(minh, "POST", `${IGA}/iga/change-requests/${selfCr?.id}/approve`, {});
check(again.json?.mode === "already-recorded" && again.json?.committed === false, "approving it again yourself does not count twice");
const minh2 = await refresh(minh);
check(!realmRoles(minh2).includes("exam-releaser"), "after refresh, minh still has no exam-releaser");
check((await decIn(minh2)).status === 403, "minh still cannot decrypt");
check((await call(nam, "GET", `${IGA}/iga/change-requests`)).status === 403, "non-council cannot even list change requests");
// The council rejects the rogue request so it does not block later grants for minh.
check((await call(hoa, "POST", `${IGA}/iga/change-requests/${selfCr?.id}/deny`, {})).status === 200, "another council member denies it");

// ---------------------------------------------------------------------------------------------
section("F6  Bell (app rule) and release request");
check((await call(nam, "POST", "/api/release-requests")).status === 409, "proctor cannot request release before the bell");
check((await call(quang, "POST", "/api/bell")).status === 403, "only the proctor can ring the (mock) bell");
check((await call(nam, "POST", "/api/bell")).status === 200, "proctor rings the bell");
const rr = await call(nam, "POST", "/api/release-requests");
check(rr.status === 200 && rr.json?.request?.id, "proctor files the release request");
check((await call(quang, "POST", "/api/release-requests")).status === 403, "non-proctor cannot file a release request");

// ---------------------------------------------------------------------------------------------
section("F7  Council quorum: 2 of 3 signatures grant release to the proctor");
const filed = await call(hoa, "POST", `${IGA}/users/${nam.sub}/role-mappings/realm`, releaseRoles);
check(filed.status === 202, "hoa files the grant for nam (counts as approval 1)");
const crId = filed.headers.get("location")?.split("/").pop();
check((await call(hoa, "PATCH", "/api/release-requests", { id: rr.json?.request?.id, changeRequestId: crId })).status === 200, "hoa links the change request to the release request");
nam = await refresh(nam);
check(!realmRoles(nam).includes("exam-releaser"), "with 1 of 2, nam's refreshed token still has no release roles");
check((await call(nam, "POST", "/api/release-requests/confirm")).status === 409, "server refuses to confirm the grant yet");
check((await decIn(nam)).status === 403, "nam cannot decrypt yet");
check((await call(nam, "POST", `${IGA}/iga/change-requests/${crId}/approve`, {})).status === 403, "the proctor cannot approve their own grant");
const p1 = await call(tuan, "POST", `${IGA}/iga/change-requests/${crId}/approve`, {});
check(p1.json?.mode === "needs-approval" && p1.json?.requestModel, "tuan gets the request to sign in the enclave");
const forgedModel = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p1.json.requestModel, "base64").toString()), approver: "hoa" })).toString("base64");
check((await call(tuan, "POST", `${IGA}/iga/change-requests/${crId}/approve`, { requestModel: forgedModel })).status === 403, "a signature naming a different approver is refused");
const p2 = await call(tuan, "POST", `${IGA}/iga/change-requests/${crId}/approve`, { requestModel: p1.json.requestModel });
check(p2.json?.committed === true && p2.json?.authCount === 2, "tuan's signature makes 2 of 2: the grant commits", p2.text);

// ---------------------------------------------------------------------------------------------
section("F8  After a session refresh the proctor opens the paper");
const stale = nam;
check((await decIn(stale)).status === 403, "the OLD token (issued before commit) still cannot decrypt");
nam = await refresh(nam);
check(realmRoles(nam).includes("exam-releaser") && realmRoles(nam).includes("_tide_decryptor"), "refreshed token carries exam-releaser + _tide_decryptor");
const conf = await call(nam, "POST", "/api/release-requests/confirm");
check(conf.status === 200 && conf.json?.effective === true, "server records the grant from the signed token");
const opened = await decIn(nam);
const plain = (opened.json?.items ?? []).map((p) => JSON.parse(p));
check(opened.status === 200 && plain[1]?.q === QUESTIONS[1].q, "proctor decrypts and reads the questions", opened.text);

// ---------------------------------------------------------------------------------------------
section("F9  Audit trail");
const audit = await call(quang, "GET", "/api/audit");
const actions = new Set((audit.json?.events ?? audit.json?.audit ?? []).map((e) => e.action));
for (const a of ["sealed", "operator_viewed", "bell_rung", "release_requested", "role_grant_filed", "release_granted"]) {
  check(actions.has(a), `audit has "${a}"`, [...actions].join(","));
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

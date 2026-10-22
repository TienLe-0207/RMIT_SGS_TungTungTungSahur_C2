import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { SignJWT, importJWK, type JWK } from "jose";

// SIMULATED TideCloak + Tide network. The organisers asked us to simulate TideCloak's sign-in, roles
// and access checks for now (the hosted licence step failed on our realm). This module stands in for
// three things that, in the real deployment, live OUTSIDE the SealedExam server:
//   1. the IdP that signs access tokens (realm key)
//   2. TideCloak IGA: role grants are change requests that need max(1, floor(0.7 x admins)) approvals
//   3. the Tide network: encrypt/decrypt only for callers whose token and signed policy allow it
// Its state (data/sim-tide.json) is separate from the app's store, and no /api route imports this
// file. In the real system the network key does not exist anywhere in one piece.

export const SIM_REALM = "sealedexam";
export const SIM_CLIENT = "sealedexam-app";
export const COUNCIL_CLIENT = "realm-management";
export const COUNCIL_ROLE = "tide-realm-admin";
export const RELEASE_ROLES = ["exam-releaser", "_tide_decryptor"];
export const CONTRACT_ID = "RelationshipAttestation:1";

export interface SimUser {
  id: string;
  username: string;
  title: string;
  realmRoles: string[];
  clientRoles: Record<string, string[]>;
}

export interface SimChangeRequest {
  id: string;
  entityType: "USER";
  entityId: string;
  actionType: "GRANT_ROLES" | "REVOKE_ROLES";
  roles: string[];
  status: "PENDING" | "APPROVED" | "DENIED";
  requestedBy: string;
  createdAt: string;
  resolvedAt?: string;
  authorizers: { username: string; timestamp: string }[];
  threshold: number;
  authorizationCount: number;
}

export interface SimState {
  authServerUrl: string;
  realmKey: { privateJwk: JWK; publicJwk: JWK };
  networkKey: string; // base64, 32 bytes
  users: SimUser[];
  changeRequests: SimChangeRequest[];
}

const statePath = () => process.env.SIM_TIDE_STATE_PATH ?? join(process.cwd(), "data", "sim-tide.json");

export function readSim(): SimState {
  try {
    return JSON.parse(readFileSync(statePath(), "utf-8"));
  } catch {
    throw new Error("Simulated TideCloak is not initialised: run `npm run sim:init`");
  }
}

export function updateSim<T>(fn: (s: SimState) => T): T {
  const s = readSim();
  const out = fn(s);
  writeFileSync(statePath(), JSON.stringify(s, null, 2));
  return out;
}

export const isCouncilUser = (u: SimUser) => (u.clientRoles[COUNCIL_CLIENT] ?? []).includes(COUNCIL_ROLE);

// TideCloak's quorum rule for IGA approvals.
export const threshold = (s: SimState) => Math.max(1, Math.floor(0.7 * s.users.filter(isCouncilUser).length));

export async function issueToken(s: SimState, user: SimUser, jkt: string): Promise<string> {
  const key = await importJWK(s.realmKey.privateJwk, "ES256");
  return new SignJWT({
    azp: SIM_CLIENT,
    preferred_username: user.username,
    realm_access: { roles: user.realmRoles },
    resource_access: Object.fromEntries(Object.entries(user.clientRoles).map(([c, roles]) => [c, { roles }])),
    cnf: { jkt },
  })
    .setProtectedHeader({ alg: "ES256", kid: String(s.realmKey.publicJwk.kid), typ: "JWT" })
    .setIssuer(`${s.authServerUrl}/realms/${SIM_REALM}`)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

// ---- the simulated Tide network --------------------------------------------------------------

export interface SimPolicy {
  contractId: string;
  subjectType: "Role";
  subjectId: string;
  assignmentId: string;
  roles: string[];
  signedBy: string;
  signedAt: string;
  sig?: string;
}

const netKey = (s: SimState) => Buffer.from(s.networkKey, "base64");
const policyMac = (s: SimState, p: SimPolicy) => {
  const { sig: _sig, ...body } = p;
  return createHmac("sha256", netKey(s)).update(JSON.stringify(body)).digest("base64");
};

export function signPolicy(s: SimState, p: Omit<SimPolicy, "sig">): string {
  const signed = { ...p, sig: policyMac(s, p as SimPolicy) };
  return Buffer.from(JSON.stringify(signed)).toString("base64");
}

export function readPolicy(s: SimState, b64: string): SimPolicy {
  let p: SimPolicy;
  try {
    p = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  } catch {
    throw new NetworkRefusal("Policy is not a network-signed policy.");
  }
  const want = Buffer.from(policyMac(s, p));
  const got = Buffer.from(String(p.sig ?? ""));
  if (p.contractId !== CONTRACT_ID || want.length !== got.length || !timingSafeEqual(want, got)) {
    throw new NetworkRefusal("Policy signature is not valid for this network.");
  }
  return p;
}

export class NetworkRefusal extends Error {}

/** The contract's checks: the caller's own token must carry the op role AND the policy's subject role. */
export function checkAccess(p: SimPolicy, realmRoles: string[], opRole: string, tags: string[]) {
  if (!p.roles.includes(opRole)) throw new NetworkRefusal(`Policy does not grant ${opRole}.`);
  if (!realmRoles.includes(opRole)) throw new NetworkRefusal(`'${opRole}' role not found in doken.`);
  if (!realmRoles.includes(p.subjectId)) throw new NetworkRefusal(`'${p.subjectId}' role not found in doken.`);
  if (tags.length !== 1 || tags[0] !== p.assignmentId) throw new NetworkRefusal("Tags do not contain assignmentId.");
}

const recordKey = (s: SimState, recordId: string) => createHmac("sha256", netKey(s)).update(`record:${recordId}`).digest();

export function encrypt(s: SimState, recordId: string, data: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", recordKey(s, recordId), iv);
  const ct = Buffer.concat([c.update(data, "utf-8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decrypt(s: SimState, recordId: string, b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const d = createDecipheriv("aes-256-gcm", recordKey(s, recordId), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf-8");
}

export const newId = () => randomUUID();

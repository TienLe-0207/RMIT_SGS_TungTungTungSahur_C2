import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair, type JWK } from "jose";

// Test harness: a fake realm signing key stands in for TideCloak, and each test user gets their own
// DPoP key, so tokens and proofs go through the real verifyTideJWT + verifyDpop code paths.

export const ORIGIN = "http://localhost:3000";
export const REALM = "sealedexam";
export const AUTH_SERVER = "http://localhost:8080";
export const CLIENT = "sealedexam-app";
export const ISSUER = `${AUTH_SERVER}/realms/${REALM}`;

const realmKeys = await generateKeyPair("ES256");
const realmJwk = { ...(await exportJWK(realmKeys.publicKey)), kid: "test-realm-key", alg: "ES256", use: "sig" };

process.env.CLIENT_ADAPTER = JSON.stringify({
  realm: REALM,
  "auth-server-url": AUTH_SERVER,
  "ssl-required": "none",
  resource: CLIENT,
  "public-client": true,
  "confidential-port": 0,
  jwk: { keys: [realmJwk] },
});

const storeDir = mkdtempSync(join(tmpdir(), "sealedexam-test-"));
process.env.SEALEDEXAM_STORE_PATH = join(storeDir, "store.json");

export function resetStore() {
  rmSync(process.env.SEALEDEXAM_STORE_PATH!, { force: true });
}

export interface User {
  username: string;
  realmRoles?: string[];
  clientRoles?: Record<string, string[]>;
}

export interface Session {
  token: string;
  dpopKey: { privateKey: CryptoKey; publicJwk: JWK };
}

export interface TokenOverrides {
  exp?: number;
  iat?: number;
  azp?: string;
  issuer?: string;
  cnf?: unknown;
  signingKey?: CryptoKey;
}

export async function newDpopKey() {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  return { privateKey, publicJwk: await exportJWK(publicKey) };
}

export async function login(user: User, o: TokenOverrides = {}): Promise<Session> {
  const dpopKey = await newDpopKey();
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    azp: o.azp ?? CLIENT,
    preferred_username: user.username,
    realm_access: { roles: user.realmRoles ?? [] },
    resource_access: Object.fromEntries(
      Object.entries(user.clientRoles ?? {}).map(([client, roles]) => [client, { roles }]),
    ),
    cnf: "cnf" in o ? o.cnf : { jkt: await calculateJwkThumbprint(dpopKey.publicJwk, "sha256") },
  };
  if (claims.cnf === undefined) delete claims.cnf;
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: realmJwk.kid, typ: "JWT" })
    .setIssuer(o.issuer ?? ISSUER)
    .setSubject(`user-${user.username}`)
    .setIssuedAt(o.iat ?? now)
    .setExpirationTime(o.exp ?? now + 300)
    .sign(o.signingKey ?? realmKeys.privateKey);
  return { token, dpopKey };
}

export interface ProofOverrides {
  htm?: string;
  htu?: string;
  iat?: number;
  jti?: string;
  ath?: string;
  key?: { privateKey: CryptoKey; publicJwk: JWK };
}

export async function dpopProof(session: Session, method: string, path: string, o: ProofOverrides = {}) {
  const key = o.key ?? session.dpopKey;
  const ath = o.ath ?? Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session.token)),
  ).toString("base64url");
  return new SignJWT({
    jti: o.jti ?? randomUUID(),
    htm: o.htm ?? method,
    htu: o.htu ?? `${ORIGIN}${path}`,
    ath,
  })
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: key.publicJwk })
    .setIssuedAt(o.iat ?? Math.floor(Date.now() / 1000))
    .sign(key.privateKey);
}

export function request(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// A well-formed DPoP-bound request, the way secureFetch sends it.
export async function call(session: Session, method: string, path: string, body?: unknown) {
  const proof = await dpopProof(session, method, path);
  return request(method, path, { authorization: `DPoP ${session.token}`, dpop: proof }, body);
}

// Demo personas (synthetic). Council membership is the realm-management client role.
export const personas = {
  linh: { username: "linh", realmRoles: ["exam-setter", "_tide_encryptor"] },
  minh: { username: "minh", clientRoles: { "realm-management": ["tide-realm-admin"] } },
  hoa: { username: "hoa", clientRoles: { "realm-management": ["tide-realm-admin"] } },
  nam: { username: "nam", realmRoles: ["proctor"] },
  quang: { username: "quang", realmRoles: ["it-operator"] },
} satisfies Record<string, User>;

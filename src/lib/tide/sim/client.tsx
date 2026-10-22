"use client";

import { SignJWT, decodeJwt, exportJWK, generateKeyPair, importJWK, type JWK } from "jose";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import tcConfig from "../../../../data/tidecloak.json";

// Browser side of the SIMULATED TideCloak (server side: src/lib/sim-tide). Exposes the subset of
// useTideCloak() that SealedExam uses, so pages do not know which one they run on. Tokens are
// DPoP-bound to a key made in this tab, and every call carries an RFC 9449 proof, so the app's
// real verifyTideJWT + verifyDpop checks run unchanged.

const SESSION_KEY = "sim-tide-session";
const AUTH = String((tcConfig as any)["auth-server-url"]).replace(/\/+$/, "");

interface Session {
  username: string;
  token: string;
  publicJwk: JWK;
  privateJwk: JWK;
}

// One session per tab (sessionStorage), so two personas can sit side by side in one browser.
let current: Session | null = null;
function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function save(s: Session | null) {
  current = s;
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function proof(s: Session, method: string, url: string) {
  const u = new URL(url, window.location.origin);
  const ath = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.token)));
  return new SignJWT({ jti: crypto.randomUUID(), htm: method.toUpperCase(), htu: `${u.origin}${u.pathname}`, ath })
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: s.publicJwk })
    .setIssuedAt()
    .sign(await importJWK(s.privateJwk, "ES256"));
}

export async function simSecureFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const s = current ?? load();
  if (!s) throw new Error("Not signed in");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `DPoP ${s.token}`);
  headers.set("DPoP", await proof(s, init.method ?? "GET", url));
  return fetch(url, { ...init, headers });
}

async function requestToken(username: string, publicJwk: JWK): Promise<string> {
  const res = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, jwk: publicJwk }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Sign-in failed (${res.status})`);
  return body.access_token;
}

/** Sign in as a persona: a fresh DPoP key for this tab, then a token bound to it. */
export async function simSignIn(username: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  save({ username, publicJwk, privateJwk, token: await requestToken(username, publicJwk) });
}

// ---- simulated Tide enclave --------------------------------------------------------------------
// In the real system this is Tide's popup, where the user's key signs. Here: a modal the user must
// confirm. Nothing is signed without that click.

type Ask = { title: string; lines: string[]; resolve: (ok: boolean) => void };
let askEnclave: ((a: Omit<Ask, "resolve">) => Promise<boolean>) | null = null;
export const enclaveConfirm = (title: string, lines: string[]) =>
  askEnclave ? askEnclave({ title, lines }) : Promise.resolve(window.confirm(`${title}\n\n${lines.join("\n")}`));

// ---- simulated Tide network ---------------------------------------------------------------------

export async function simNetwork<T>(op: "encrypt" | "decrypt" | "sign-policy", body: unknown): Promise<T> {
  const res = await simSecureFetch(`${AUTH}/network/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? `Network error ${res.status}`, { cause: out?.cause });
  return out as T;
}

export async function simSignRelationshipPolicy(grant: { subject: { id: string }; recordId: string; access: "read" | "write" }) {
  const ok = await enclaveConfirm("Sign paper policy", [
    `Role ${grant.subject.id} may ${grant.access === "write" ? "seal into (write-only)" : "open (read-only)"} ${grant.recordId}.`,
    `Contract: RelationshipAttestation:1`,
  ]);
  if (!ok) throw new Error("You declined in the Tide enclave");
  const { policy } = await simNetwork<{ policy: string }>("sign-policy", { subjectId: grant.subject.id, recordId: grant.recordId, access: grant.access });
  return policy;
}

// ---- provider -------------------------------------------------------------------------------

function useSimState() {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setInit] = useState(true);
  const [ask, setAsk] = useState<Ask | null>(null);

  useEffect(() => {
    const s = load();
    current = s;
    setSession(s);
    setInit(false);
    askEnclave = (a) => new Promise((resolve) => setAsk({ ...a, resolve }));
    return () => {
      askEnclave = null;
    };
  }, []);

  const claims = useMemo(() => (session ? (decodeJwt(session.token) as Record<string, any>) : null), [session]);

  const api = useMemo(
    () => ({
      authenticated: !!session,
      isInitializing,
      token: session?.token ?? null,
      login: () => {
        window.location.assign(`/sim-tide/login?return=${encodeURIComponent(window.location.pathname)}`);
      },
      logout: () => {
        save(null);
        window.location.assign("/");
      },
      getValueFromToken: (k: string) => claims?.[k] ?? null,
      hasRealmRole: (r: string) => !!claims?.realm_access?.roles?.includes(r),
      hasClientRole: (r: string, client: string) => !!claims?.resource_access?.[client]?.roles?.includes(r),
      getVendorId: () => String((tcConfig as any).vendorId ?? ""),
      secureFetch: simSecureFetch,
      forceRefreshToken: async () => {
        const s = current ?? load();
        if (!s) return false;
        const next = { ...s, token: await requestToken(s.username, s.publicJwk) };
        save(next);
        setSession(next);
        return true;
      },
      approveTideRequests: async (requests: { id: string; request: Uint8Array }[]) => {
        const out = [];
        for (const r of requests) {
          let detail: any = {};
          try {
            detail = JSON.parse(new TextDecoder().decode(r.request));
          } catch {}
          const ok = await enclaveConfirm("Approve change request", [
            `Change request ${String(detail.changeRequestId ?? r.id).slice(0, 8)}`,
            `Grants: ${(detail.roles ?? []).join(", ") || "roles"}`,
            `Signing as ${s(detail.approver)}`,
          ]);
          out.push(ok ? { id: r.id, approved: { request: r.request } } : { id: r.id, denied: true });
        }
        return out;
      },
    }),
    [session, isInitializing, claims]
  );
  return { api, ask, setAsk };
}

const s = (v: unknown) => String(v ?? "");

type SimTide = ReturnType<typeof useSimState>["api"];
const Ctx = createContext<SimTide | null>(null);

export function SimTideProvider({ children }: { children: ReactNode }) {
  const { api, ask, setAsk } = useSimState();
  const answer = useCallback((ok: boolean) => { ask?.resolve(ok); setAsk(null); }, [ask, setAsk]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {ask && (
        <div className="enclave-backdrop" role="dialog" aria-modal="true">
          <div className="enclave">
            <div className="enclave-head">
              <span className="seal-mark">✎</span>
              <div>
                <strong>Tide enclave</strong>
                <div className="small muted">Simulated for this prototype</div>
              </div>
            </div>
            <h3>{ask.title}</h3>
            <ul>{ask.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => answer(false)}>Decline</button>
              <button className="btn primary" onClick={() => answer(true)}>Sign</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useSimTide(): SimTide {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSimTide must be used inside SimTideProvider");
  return v;
}

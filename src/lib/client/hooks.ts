"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditEvent, QuestionItem, ReleaseRequest, Store } from "@/lib/store";

export type PaperView = {
  paper: Store["paper"];
  policies: Store["policies"];
  questions: Pick<QuestionItem, "id" | "author" | "ciphertext" | "createdAt">[];
};
export type { AuditEvent, ReleaseRequest, Store };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The signed-in user, read from the token. UI gating only: every API route checks again. */
export function useMe() {
  const tc = useTideCloak();
  const on = tc.authenticated;
  const claim = (k: string) => (on ? tc.getValueFromToken(k) : null);
  return {
    tc,
    username: String(claim("preferred_username") ?? ""),
    sub: String(claim("sub") ?? ""),
    roles: {
      setter: on && tc.hasRealmRole("exam-setter"),
      proctor: on && tc.hasRealmRole("proctor"),
      releaser: on && tc.hasRealmRole("exam-releaser"),
      decryptor: on && tc.hasRealmRole("_tide_decryptor"),
      encryptor: on && tc.hasRealmRole("_tide_encryptor"),
      operator: on && tc.hasRealmRole("it-operator"),
      council: on && tc.hasClientRole("tide-realm-admin", "realm-management"),
    },
  };
}

/** Calls to our own API. Always secureFetch: the server checks the DPoP proof on every route. */
export function useApi() {
  const { secureFetch } = useTideCloak();
  return useCallback(
    async <T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
      const res = await secureFetch(`${window.location.origin}${path}`, {
        method: init?.method ?? "GET",
        ...(init?.body !== undefined
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
          : {}),
      });
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { error: text };
      }
      if (!res.ok) throw new ApiError(res.status, `${res.status}: ${body?.error ?? res.statusText}`);
      return body as T;
    },
    [secureFetch]
  );
}

/** Run `fn` now and every `ms` while the tab is visible. */
export function usePoll(fn: () => Promise<unknown> | void, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      Promise.resolve(ref.current()).catch(() => {});
    };
    tick();
    const t = setInterval(() => {
      if (!document.hidden) tick();
    }, ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

/** One button's async action: busy flag, error text, and a runner. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, setError, run };
}

"use client";

import { useEffect, useState } from "react";
import { Button, Notice, PageHead, PersonaChip } from "@/components/ui";
import { simSignIn } from "@/lib/tide/sim/client";

// SIMULATED Tide sign-in. Stands in for Tide's passwordless login: choosing a persona here plays the
// part of that persona proving their Tide key. Everything after this point (DPoP-bound token,
// server-side role checks, quorum, network checks) runs as it would against TideCloak.
export default function SimLoginPage() {
  const [users, setUsers] = useState<{ username: string; title: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/sim-tide/token")
      .then((r) => r.json())
      .then((b) => (b.users ? setUsers(b.users) : setError(b.error ?? "Simulated TideCloak is not running")))
      .catch((e) => setError(String(e)));
  }, []);

  const signIn = async (username: string) => {
    setBusy(username);
    setError(null);
    try {
      await simSignIn(username);
      const ret = new URLSearchParams(window.location.search).get("return");
      window.location.assign(ret && ret.startsWith("/") && !ret.startsWith("/sim-tide") ? ret : "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <PageHead title="Sign in with Tide">
        Simulated TideCloak sign-in for this prototype. Choose the account to act as. Use one browser profile per person.
      </PageHead>
      <table className="align-middle">
        <thead>
          <tr><th>Account</th><th style={{ width: 1 }}><span className="sr-only">Action</span></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.username}>
              <td><PersonaChip username={u.username} /></td>
              <td>
                <Button variant="primary" busy={busy === u.username} onClick={() => signIn(u.username)}>Sign in</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <Notice tone="danger" title="Could not sign in">{error}. Run `npm run sim:init`, then restart `npm run dev`.</Notice>}
      <p className="small muted">All people are fictional.</p>
    </div>
  );
}

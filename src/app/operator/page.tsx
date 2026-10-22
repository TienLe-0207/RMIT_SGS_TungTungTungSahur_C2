"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Cipher, Gate, Notice, PageHead, PersonaChip, time } from "@/components/ui";
import { useAction, useApi, type Store } from "@/lib/client/hooks";

export default function OperatorPage() {
  return (
    <>
      <PageHead title="Operator view">
        Everything the SealedExam server holds, unfiltered. Whoever runs this platform (or breaks into it) sees exactly this.
      </PageHead>
      <Gate who="the IT operator and council members" allow={(r) => r.operator || r.council}>
        <Operator />
      </Gate>
    </>
  );
}

function Operator() {
  const api = useApi();
  const { busy, error, run } = useAction();
  const [store, setStore] = useState<Store | null>(null);
  const [query, setQuery] = useState("");

  // Loaded on open and on demand, never polled: each load is an audited operator view.
  const load = () => run("load", async () => setStore(await api<Store>("/api/vault")));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const raw = store ? JSON.stringify(store) : "";
  const q = query.trim();
  const hits = q ? raw.toLowerCase().split(q.toLowerCase()).length - 1 : 0;

  return (
    <div className="stack">
      <Notice tone="info" title="This is everything the platform holds.">
        It can copy or leak all of it. It still opens nothing: there is no key here, only ciphertext and network-signed policies.
      </Notice>

      <Card
        title="Search the store for plaintext"
        sub="Type any word from a question (try “derivative” or “12 × 8”). The search runs over the raw store file."
      >
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <input placeholder="Search the raw data…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button busy={busy === "load"} onClick={load}>Reload</Button>
        </div>
        {q && (
          <p style={{ marginTop: 10 }}>
            <Badge tone={hits ? "danger" : "ok"}>{hits} match(es)</Badge>{" "}
            <span className="muted">for “{q}” in {raw.length.toLocaleString()} characters of stored data.</span>
          </p>
        )}
      </Card>

      {store && (
        <>
          <Card title="Sealed questions" aside={<Badge>{store.questions.length}</Badge>}>
            {store.questions.length === 0 ? (
              <p className="muted">Nothing sealed yet.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Author</th><th>Sealed</th><th>Stored content</th></tr>
                </thead>
                <tbody>
                  {store.questions.map((qn) => (
                    <tr key={qn.id}>
                      <td><PersonaChip username={qn.author} showTitle={false} /></td>
                      <td className="mono">{time(qn.createdAt)}</td>
                      <td style={{ width: "65%" }}><Cipher text={qn.ciphertext} max={160} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="grid two">
            <Card title="Paper policies" sub="Signed by the Tide network. Useless without the roles they name.">
              <p className="small muted">Write (setters): {store.policies.write ? `${store.policies.write.length} bytes (base64)` : "not signed"}</p>
              {store.policies.write && <Cipher text={store.policies.write} max={120} />}
              <p className="small muted" style={{ marginTop: 10 }}>Read (exam-releaser): {store.policies.read ? `${store.policies.read.length} bytes (base64)` : "not signed"}</p>
              {store.policies.read && <Cipher text={store.policies.read} max={120} />}
            </Card>
            <Card title="Metadata">
              <table>
                <tbody>
                  <tr><td className="muted">Paper</td><td>{store.paper.title}</td></tr>
                  <tr><td className="muted">Site</td><td>{store.paper.site}</td></tr>
                  <tr><td className="muted">Bell</td><td>{store.paper.bellRungAt ? time(store.paper.bellRungAt) : "not rung"}</td></tr>
                  <tr><td className="muted">Release requests</td><td>{store.releaseRequests.length}</td></tr>
                  <tr><td className="muted">Audit events</td><td>{store.audit.length}</td></tr>
                </tbody>
              </table>
            </Card>
          </div>

          <details>
            <summary>Raw store.json</summary>
            <pre className="raw">{JSON.stringify(store, null, 2)}</pre>
          </details>
        </>
      )}

      {error && <Notice tone="danger" title="Could not load the store">{error}</Notice>}
    </div>
  );
}

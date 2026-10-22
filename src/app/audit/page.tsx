"use client";

import { useState } from "react";
import { Badge, Card, Gate, Notice, PageHead, PersonaChip, time } from "@/components/ui";
import { useApi, useMe, usePoll, type AuditEvent } from "@/lib/client/hooks";
import { listChangeRequests, type ChangeRequest } from "@/lib/tide/iga";

const LABELS: Record<string, { text: string; tone?: "ok" | "warn" | "danger" | "info" | "gold" }> = {
  sealed: { text: "Sealed questions", tone: "gold" },
  policy_signed: { text: "Signed paper policy", tone: "gold" },
  operator_viewed: { text: "Viewed raw store", tone: "info" },
  bell_rung: { text: "Rang the bell (mock)", tone: "warn" },
  release_requested: { text: "Requested release", tone: "warn" },
  role_grant_filed: { text: "Filed role grant", tone: "info" },
  approval_signed: { text: "Signed approval", tone: "ok" },
  approval_recorded: { text: "Approval in TideCloak", tone: "ok" },
  release_granted: { text: "Release role in token", tone: "ok" },
  self_grant_attempt: { text: "Self-grant attempt", tone: "danger" },
  decrypt_denied: { text: "Decrypt refused", tone: "danger" },
  paper_decrypted: { text: "Opened the paper", tone: "ok" },
};

const SOURCE_NOTE: Record<string, string> = {
  app: "recorded by the app server",
  tidecloak: "read from TideCloak",
  "client-reported": "reported by the user's browser; actor verified from the token, event not verifiable by the server",
};

export default function AuditPage() {
  return (
    <>
      <PageHead title="Audit trail">
        Every step, with who and when. App events come from the server. Approvals are also shown as TideCloak records them,
        which is the authoritative source.
      </PageHead>
      <Gate who="signed-in users" allow={() => true}>
        <Audit />
      </Gate>
    </>
  );
}

function Audit() {
  const { tc, roles } = useMe();
  const api = useApi();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [resolved, setResolved] = useState<ChangeRequest[] | null>(null);
  const [crError, setCrError] = useState<string | null>(null);

  usePoll(async () => setEvents((await api<{ audit: AuditEvent[] }>("/api/audit")).audit), 5000);
  usePoll(
    async () => {
      try {
        const [approved, denied] = await Promise.all([
          listChangeRequests(tc.secureFetch, "APPROVED"),
          listChangeRequests(tc.secureFetch, "DENIED"),
        ]);
        setResolved([...approved, ...denied].filter((c) => /ROLE/i.test(c.actionType)));
        setCrError(null);
      } catch (err) {
        setCrError(err instanceof Error ? err.message : String(err));
      }
    },
    10000,
    roles.council
  );

  return (
    <div className="stack">
      <Card title="App events" aside={<Badge>{events.length}</Badge>}>
        {events.length === 0 ? (
          <p className="muted">No events yet.</p>
        ) : (
          <ul className="timeline">
            {[...events].reverse().map((e) => {
              const l = LABELS[e.action] ?? { text: e.action };
              return (
                <li key={e.id}>
                  <time>{time(e.ts)}</time>
                  <div>
                    <div className="what">
                      <PersonaChip username={e.actor} showTitle={false} />
                      <Badge tone={l.tone}>{l.text}</Badge>
                      <span title={SOURCE_NOTE[e.source]}>
                        <Badge>{e.source}</Badge>
                      </span>
                    </div>
                    {e.details && <div className="details">{e.details}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {roles.council && (
        <Card
          title="Role changes as recorded by TideCloak"
          sub="Resolved change requests and who signed them, read directly from TideCloak with your token."
          aside={<Badge tone="gold">tidecloak</Badge>}
        >
          {crError && <Notice tone="danger" title="Could not read TideCloak">{crError}</Notice>}
          {resolved && resolved.length === 0 && <p className="muted">No resolved role changes yet.</p>}
          {resolved && resolved.length > 0 && (
            <table>
              <thead><tr><th>Action</th><th>Status</th><th>Signed by</th><th>Resolved</th></tr></thead>
              <tbody>
                {resolved.map((c) => (
                  <tr key={c.id}>
                    <td><Badge tone="info">{c.actionType}</Badge> <span className="mono small">{c.id.slice(0, 8)}</span></td>
                    <td><Badge tone={c.status === "APPROVED" ? "ok" : "danger"}>{c.status}</Badge></td>
                    <td>
                      <div className="row">
                        {c.authorizers?.length
                          ? c.authorizers.map((a) => <PersonaChip key={a.username} username={a.username} showTitle={false} />)
                          : <span className="muted">—</span>}
                      </div>
                    </td>
                    <td className="mono">{time(c.resolvedAt ?? c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

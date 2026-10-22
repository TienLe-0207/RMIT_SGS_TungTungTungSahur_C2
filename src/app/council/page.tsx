"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Gate, Notice, PageHead, PersonaChip, time } from "@/components/ui";
import { releaseProgress, useAction, useApi, useMe, usePoll, type PaperView, type ReleaseRequest } from "@/lib/client/hooks";
import {
  approveChangeRequest, denyChangeRequest, explainTideError, fetchAdminPolicy, findChangeRequest, listChangeRequests,
  requestReleaseGrant, requestReleaseRevoke, userName, vendorId, type ChangeRequest,
} from "@/lib/tide/iga";
import { signRelationshipPolicy } from "@/lib/tide/relationship";
import { openQuestions } from "@/lib/tide/paper";

export default function CouncilPage() {
  return (
    <>
      <PageHead title="Council">
        Granting the role that opens the paper is a TideCloak change request. It takes effect only when enough council
        members have signed it in their own Tide enclave. No council member can do it alone, including for themselves.
      </PageHead>
      <Gate who="council members (tide-realm-admin)" allow={(r) => r.council}>
        <Council />
      </Gate>
    </>
  );
}

const approvalsOf = (cr: ChangeRequest) => cr.authorizationCount ?? cr.authorizers?.length ?? null;

function Council() {
  const { tc, username, sub } = useMe();
  const api = useApi();
  const sf = tc.secureFetch;
  const { busy, error, run } = useAction();
  const [paper, setPaper] = useState<PaperView | null>(null);
  const [requests, setRequests] = useState<ReleaseRequest[]>([]);
  const [crs, setCrs] = useState<ChangeRequest[] | null>(null);
  const [crError, setCrError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "warn" | "danger" | "info"; title: string; text?: string } | null>(null);
  const [attack, setAttack] = useState<{ crId: string | null; decrypt?: string } | null>(null);
  const names = useRef(new Map<string, string>());
  const [, bump] = useState(0);

  const loadApp = async () => {
    const [p, r] = await Promise.all([
      api<PaperView>("/api/paper"),
      api<{ releaseRequests: ReleaseRequest[] }>("/api/release-requests"),
    ]);
    setPaper(p);
    setRequests(r.releaseRequests);
  };
  const loadCrs = async () => {
    try {
      const list = await listChangeRequests(sf);
      setCrs(list);
      setCrError(null);
      for (const cr of list) {
        if (cr.entityId && !names.current.has(cr.entityId)) {
          names.current.set(cr.entityId, cr.entityId);
          userName(sf, cr.entityId).then((n) => { names.current.set(cr.entityId, n); bump((x) => x + 1); });
        }
      }
    } catch (err) {
      setCrError(err instanceof Error ? err.message : String(err));
    }
  };
  usePoll(loadApp, 4000);
  usePoll(loadCrs, 5000);

  // Who a change request is about, in persona terms, when we can tell.
  // entityId first; the whole-request search is a fallback because it can also contain the filer's id.
  const targetOf = (cr: ChangeRequest): { username: string; userId: string } | null => {
    if (sub && cr.entityId === sub) return { username, userId: sub };
    const byEntity = requests.find((r) => r.requesterUserId === cr.entityId);
    if (byEntity) return { username: byEntity.requester, userId: byEntity.requesterUserId };
    const n = names.current.get(cr.entityId);
    if (n && n !== cr.entityId) return { username: n, userId: cr.entityId };
    const blob = JSON.stringify(cr);
    const rr = requests.find((r) => blob.includes(r.requesterUserId));
    if (rr) return { username: rr.requester, userId: rr.requesterUserId };
    if (sub && blob.includes(sub)) return { username, userId: sub };
    return null;
  };
  const releaseFor = (crId: string) => requests.find((r) => r.changeRequestIds.includes(crId));

  // Relay the change request as TideCloak shows it to this browser (status, threshold, authorizers[]).
  // The server checks it is a role grant for this proctor. Best effort: the decisive record is the
  // proctor's own token (/api/release-requests/confirm), so a refusal here only shows a warning.
  const reportSnapshot = async (rr: ReleaseRequest, crId: string) => {
    try {
      const cr = await findChangeRequest(sf, crId);
      if (!cr) return;
      await api("/api/release-requests", { method: "PATCH", body: { id: rr.id, changeRequestId: crId, changeRequest: cr } });
    } catch (err) {
      setFlash({ tone: "warn", title: "Approval saved in TideCloak, but the app could not record its progress.", text: err instanceof Error ? err.message : String(err) });
    }
  };

  // ---- actions ----
  const signPolicy = (kind: "write" | "read") =>
    run(`policy-${kind}`, async () => {
      if (!paper) return;
      const adminPolicy = await fetchAdminPolicy(sf);
      const signed = await signRelationshipPolicy(
        {
          vendorId: vendorId() || tc.getVendorId(),
          subject: { type: "Role", id: kind === "write" ? "exam-setter" : "exam-releaser" },
          recordId: paper.paper.id,
          access: kind,
        },
        adminPolicy
      ).catch((err) => { throw new Error(explainTideError(err).message); });
      await api("/api/policies", { method: "POST", body: { kind, policy: signed } });
      setFlash({ tone: "ok", title: `${kind === "write" ? "Write" : "Read"} policy signed by the Tide network.` });
      await loadApp();
    });

  const fileGrant = (rr: ReleaseRequest) =>
    run(`file-${rr.id}`, async () => {
      const { changeRequestId } = await requestReleaseGrant(sf, rr.requesterUserId);
      if (!changeRequestId) throw new Error("TideCloak accepted the request but no change request id came back. Check the list below.");
      // Link first, without a snapshot, so the release request is tied to its change request even if
      // the snapshot check below refuses what this browser read.
      await api("/api/release-requests", { method: "PATCH", body: { id: rr.id, changeRequestId } });
      await reportSnapshot(rr, changeRequestId);
      const list = await listChangeRequests(sf);
      setFlash({ tone: "info", title: `Change request filed for ${rr.requester}.`, text: "Filing counts as your approval. Another council member must sign before it takes effect." });
      setCrs(list);
      await loadApp();
    });

  const approve = (cr: ChangeRequest) =>
    run(`approve-${cr.id}`, async () => {
      const res = await approveChangeRequest(sf, tc.approveTideRequests, cr.id);
      const target = targetOf(cr)?.username ?? cr.entityId;
      const count = res.authCount ?? null;
      const threshold = res.threshold ?? cr.threshold ?? null;
      await api("/api/audit", {
        method: "POST",
        body: { action: "approval_signed", details: `Signed ${cr.actionType} for ${target} (CR ${cr.id.slice(0, 8)}): ${res.committed ? "quorum met, committed" : `${count ?? "?"} of ${threshold ?? "?"}`}` },
      });
      const rr = releaseFor(cr.id);
      if (rr) await reportSnapshot(rr, cr.id);
      setFlash(
        res.committed
          ? { tone: "ok", title: "Quorum met. The change is committed.", text: `${target} gets the role after refreshing their session.` }
          : { tone: "info", title: "Your approval is recorded.", text: `${count ?? "?"} of ${threshold ?? "?"} approvals so far.` }
      );
      await Promise.all([loadCrs(), loadApp()]);
    });

  const deny = (cr: ChangeRequest) =>
    run(`deny-${cr.id}`, async () => {
      await denyChangeRequest(sf, cr.id, "Denied from the SealedExam council panel");
      setFlash({ tone: "warn", title: "Change request denied." });
      await loadCrs();
    });

  const selfGrant = () =>
    run("self-grant", async () => {
      const { status, changeRequestId } = await requestReleaseGrant(sf, sub);
      setAttack({ crId: changeRequestId });
      await api("/api/audit", {
        method: "POST",
        body: { action: "self_grant_attempt", details: `Tried to grant exam-releaser to themselves. TideCloak answered ${status}: change request ${changeRequestId?.slice(0, 8) ?? "?"} is pending, not effective.` },
      });
      await loadCrs();
    });

  const tryDecrypt = () =>
    run("try-decrypt", async () => {
      if (!paper?.policies.read || !paper.questions.length) throw new Error("Nothing to decrypt yet: seal questions and sign the read policy first.");
      try {
        const qs = await openQuestions(paper.questions.map((q) => q.ciphertext), paper.paper.id, paper.policies.read);
        setAttack((a) => ({ crId: a?.crId ?? null, decrypt: `Decrypted ${qs.length} question(s). This should not happen without the quorum.` }));
        await api("/api/audit", { method: "POST", body: { action: "paper_decrypted", details: "Council member decrypted the paper" } });
      } catch (err) {
        const e = explainTideError(err);
        setAttack((a) => ({ crId: a?.crId ?? null, decrypt: e.message }));
        await api("/api/audit", { method: "POST", body: { action: "decrypt_denied", details: `Council member tried to decrypt the paper. ${e.message}`.slice(0, 300) } });
      }
    });

  const latestProctor = [...requests].reverse()[0];
  const revoke = () =>
    run("revoke", async () => {
      if (!latestProctor) throw new Error("No proctor has requested release yet.");
      const { changeRequestId } = await requestReleaseRevoke(sf, latestProctor.requesterUserId);
      setFlash({ tone: "info", title: `Revoke filed for ${latestProctor.requester}.`, text: `Change request ${changeRequestId?.slice(0, 8) ?? "?"} needs the same quorum.` });
      await loadCrs();
    });

  const myCr = attack?.crId ? crs?.find((c) => c.id === attack.crId) : crs?.find((c) => targetOf(c)?.userId === sub);

  return (
    <div className="stack">
      {flash && <Notice tone={flash.tone} title={flash.title}>{flash.text}</Notice>}
      {error && <Notice tone="danger" title="Something went wrong">{error}</Notice>}

      {/* ---- release requests ---- */}
      <Card title="Release requests" sub="Proctors ask for the paper after the bell. File the role grant, then collect approvals below." aside={<Badge>{requests.length}</Badge>}>
        {requests.length === 0 ? (
          <p className="muted">No release requests yet.</p>
        ) : (
          <table>
            <thead><tr><th>Proctor</th><th>Site</th><th>Asked</th><th>Council</th><th /></tr></thead>
            <tbody>
              {[...requests].reverse().map((rr) => (
                <tr key={rr.id}>
                  <td><PersonaChip username={rr.requester} showTitle={false} /></td>
                  <td className="small">{rr.site}</td>
                  <td className="mono">{time(rr.createdAt)}</td>
                  <td>
                    {(() => {
                      const p = releaseProgress(rr);
                      if (p?.confirmed) return <Badge tone="ok">granted</Badge>;
                      if (p?.committed) return <Badge tone="ok">approved</Badge>;
                      return p?.label ? <Badge tone="warn">{p.label}</Badge> : <Badge>not filed</Badge>;
                    })()}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {rr.changeRequestIds.length === 0 && (
                      <Button variant="primary" busy={busy === `file-${rr.id}`} onClick={() => fileGrant(rr)}>File role grant</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ---- change requests ---- */}
      <Card
        title="Pending change requests"
        sub="Read live from TideCloak with your own token. Approving opens the Tide enclave, where you sign."
        aside={<Badge tone="gold">{crs?.length ?? "…"} pending</Badge>}
      >
        {crError && <Notice tone="danger" title="Could not read change requests from TideCloak">{crError}</Notice>}
        {crs && crs.length === 0 && <p className="muted">Nothing waiting for approval.</p>}
        <div className="stack">
          {crs?.map((cr) => {
            const target = targetOf(cr);
            const n = approvalsOf(cr);
            const isSelf = !!target && target.userId === sub;
            const rr = releaseFor(cr.id);
            return (
              <div key={cr.id} className="card" style={{ background: "var(--panel-2)", padding: 16 }}>
                <div className="row">
                  <Badge tone="info">{cr.actionType}</Badge>
                  {target ? <span className="row">for <PersonaChip username={target.username} showTitle={false} /></span> : <span className="mono small">{cr.entityType} {cr.entityId?.slice(0, 8)}</span>}
                  {isSelf && <Badge tone="danger">self-grant</Badge>}
                  {rr && <Badge tone="ok">release request</Badge>}
                  <span className="spacer" />
                  <Badge tone="warn">{n ?? "?"} of {cr.threshold ?? "?"} approvals</Badge>
                </div>
                <p className="small muted" style={{ margin: "8px 0" }}>
                  CR {cr.id.slice(0, 8)}
                  {cr.requestedBy && <> · filed by {cr.requestedBy}</>}
                  {cr.createdAt && <> · {time(cr.createdAt)}</>}
                  {cr.authorizers?.length ? <> · signed by {cr.authorizers.map((a) => a.username).join(", ")}</> : null}
                </p>
                <div className="row">
                  <Button variant="primary" busy={busy === `approve-${cr.id}`} onClick={() => approve(cr)}>Approve (sign with Tide)</Button>
                  <Button variant="ghost" busy={busy === `deny-${cr.id}`} onClick={() => deny(cr)}>Deny</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---- attack ---- */}
      <Card
        tone="danger"
        title="Rogue official simulation"
        sub="What if a council member wants the paper early? Try it. Every attempt is logged."
      >
        <div className="grid two">
          <div>
            <h3>Grant myself release rights</h3>
            <p className="small muted">Files a TideCloak change request giving you exam-releaser and the decrypt role.</p>
            <Button variant="danger" busy={busy === "self-grant"} onClick={selfGrant}>Grant myself release rights</Button>
            {attack && (
              <div style={{ marginTop: 12 }}>
                <Notice tone="warn" title={myCr ? `PENDING: ${approvalsOf(myCr) ?? "?"} of ${myCr.threshold ?? "?"} approvals. Not effective.` : "Filed. Pending, not effective."}>
                  Your own filing counts as one approval. TideCloak will not apply it until another council member signs.
                </Notice>
              </div>
            )}
          </div>
          <div>
            <h3>Try to decrypt the paper now</h3>
            <p className="small muted">Uses the real read policy and the real ciphertext. The Tide network decides.</p>
            <Button variant="danger" busy={busy === "try-decrypt"} onClick={tryDecrypt}>Try to decrypt now</Button>
            {attack?.decrypt && (
              <div style={{ marginTop: 12 }}>
                <Notice tone="danger" title="Refused by the Tide network">{attack.decrypt}</Notice>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ---- setup ---- */}
      <Card
        tone="gold"
        title="Paper policies (one-time setup)"
        sub="Two network-signed policies for this paper: setters may write into it, holders of exam-releaser may read it. Signing opens the Tide enclave."
      >
        <div className="row">
          <Badge tone={paper?.policies.write ? "ok" : "warn"}>write: {paper?.policies.write ? "signed" : "missing"}</Badge>
          <Badge tone={paper?.policies.read ? "ok" : "warn"}>read: {paper?.policies.read ? "signed" : "missing"}</Badge>
          {paper?.policies.signedBy && <span className="small muted">last signed by {paper.policies.signedBy} at {time(paper.policies.signedAt)}</span>}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Button busy={busy === "policy-write"} onClick={() => signPolicy("write")}>Sign write policy (exam-setter)</Button>
          <Button busy={busy === "policy-read"} onClick={() => signPolicy("read")}>Sign read policy (exam-releaser)</Button>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          A policy names a role, not a person. Reading also needs the _tide_decryptor role, which only the council quorum can grant.
        </p>
      </Card>

      <details>
        <summary>Demo tools</summary>
        <div style={{ marginTop: 12 }}>
          <Card title="Revoke release roles" sub="To rehearse again: file a change request removing exam-releaser and _tide_decryptor from the last proctor. It needs the same quorum. Then run `npm run reset`.">
            <Button busy={busy === "revoke"} disabled={!latestProctor} onClick={revoke}>
              Revoke from {latestProctor?.requester ?? "proctor"}
            </Button>
          </Card>
        </div>
      </details>
    </div>
  );
}

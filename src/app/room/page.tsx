"use client";

import { useState } from "react";
import { Badge, Button, Card, Gate, Notice, PageHead, Stepper, time, type StepState } from "@/components/ui";
import { ApiError, releaseProgress, useAction, useApi, useMe, usePoll, type PaperView, type ReleaseRequest } from "@/lib/client/hooks";
import type { Question } from "@/lib/samplePaper";
import { openQuestions } from "@/lib/tide/paper";
import { explainTideError } from "@/lib/tide/iga";

export default function RoomPage() {
  return (
    <>
      <PageHead title="Exam room">
        The paper has been at this site, sealed, for days. At the bell the proctor asks the council to release it. Only when
        the quorum has signed does the Tide network let this browser decrypt it.
      </PageHead>
      <Gate who="proctors" allow={(r) => r.proctor}>
        <Room />
      </Gate>
    </>
  );
}

function Room() {
  const { tc, username, roles } = useMe();
  const api = useApi();
  const { busy, error, run } = useAction();
  const [paper, setPaper] = useState<PaperView | null>(null);
  const [requests, setRequests] = useState<ReleaseRequest[]>([]);
  const [opened, setOpened] = useState<Question[] | null>(null);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);

  const load = async () => {
    const [p, r] = await Promise.all([
      api<PaperView>("/api/paper"),
      api<{ releaseRequests: ReleaseRequest[] }>("/api/release-requests"),
    ]);
    setPaper(p);
    setRequests(r.releaseRequests);
  };
  usePoll(load, 4000);

  const mine = [...requests].reverse().find((r) => r.requester === username);
  const progress = releaseProgress(mine);
  const bell = paper?.paper.bellRungAt;
  const sealedCount = paper?.questions.length ?? 0;

  const ringBell = () => run("bell", async () => { await api("/api/bell", { method: "POST" }); await load(); });
  const requestRelease = () => run("request", async () => { await api("/api/release-requests", { method: "POST" }); await load(); });
  // After the refresh, hand the new token to the server: it records the grant as TideCloak-confirmed
  // only if the token itself carries the release roles. 409 just means the quorum has not committed yet.
  const refresh = () =>
    run("refresh", async () => {
      await tc.forceRefreshToken();
      setRefreshedAt(Date.now());
      try {
        await api("/api/release-requests/confirm", { method: "POST" });
        setConfirmNote(null);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        setConfirmNote("Not in your token yet. TideCloak can take up to two minutes after the quorum signs.");
      }
      await load();
    });
  const open = () =>
    run("open", async () => {
      if (!paper?.policies.read) throw new Error("The paper's read policy has not been signed yet.");
      setRefusal(null);
      try {
        const qs = await openQuestions(paper.questions.map((q) => q.ciphertext), paper.paper.id, paper.policies.read);
        setOpened(qs);
        setOpenedAt(Date.now());
        await api("/api/audit", { method: "POST", body: { action: "paper_decrypted", details: `Opened ${qs.length} question(s) at ${paper.paper.site}` } });
      } catch (err) {
        const e = explainTideError(err);
        setRefusal(e.message);
        await api("/api/audit", { method: "POST", body: { action: "decrypt_denied", details: `Proctor tried to open the paper. ${e.message}`.slice(0, 300) } });
      }
    });

  const approvals = progress?.label ?? null;

  const st = (done: boolean, active: boolean): StepState => (done ? "done" : active ? "active" : "todo");
  const steps = [
    { label: "Sealed", state: st(sealedCount > 0, true), note: `${sealedCount} question(s)` },
    { label: "Bell", state: st(!!bell, sealedCount > 0), note: bell ? time(bell) : "not yet" },
    { label: "Requested", state: st(!!mine, !!bell), note: mine ? time(mine.createdAt) : "—" },
    { label: "Council", state: st(!!progress?.committed || roles.releaser, !!mine), note: approvals ?? "waiting" },
    { label: "Role in session", state: st(roles.releaser, !!progress?.committed), note: roles.releaser ? "exam-releaser" : "refresh after approval" },
    { label: "Opened", state: (opened ? "done" : refusal ? "blocked" : roles.releaser ? "active" : "todo") as StepState, note: opened ? `${opened.length} questions` : refusal ? "refused" : "—" },
  ];

  return (
    <div className="stack">
      <Card
        title={paper?.paper.title ?? "Loading paper…"}
        sub={paper?.paper.site}
        tone="gold"
        aside={opened ? <Badge tone="ok">Opened</Badge> : <Badge tone="gold">Sealed</Badge>}
      >
        <Stepper steps={steps} />
      </Card>

      <div className="grid two">
        <Card title="1. Ring the exam bell" sub="Mock: in this prototype a button stands in for the exam clock. It is app logic, not a cryptographic time-lock; the quorum is the real control.">
          <Button busy={busy === "bell"} disabled={!!bell} onClick={ringBell}>
            {bell ? `Bell rung at ${time(bell)}` : "Ring the bell (mock)"}
          </Button>
        </Card>

        <Card title="2. Request release" sub="Asks the council to grant you exam-releaser. App rule: not before the bell. The server enforces it.">
          <Button variant="primary" busy={busy === "request"} disabled={!!mine} onClick={requestRelease}>
            {mine ? `Requested at ${time(mine.createdAt)}` : "Request release"}
          </Button>
          {mine && (
            <p className="small muted" style={{ marginTop: 10 }}>
              Council progress: <strong>{approvals ?? "waiting for a council member to file the grant"}</strong>
              {progress?.approvals.length ? <> · signed by {progress.approvals.map((a) => a.username).join(", ")} (client-reported)</> : null}
              {mine.grantConfirmedAt && <> · confirmed from your TideCloak token at {time(mine.grantConfirmedAt)}</>}
            </p>
          )}
        </Card>

        <Card title="3. Refresh your session" sub="A role granted by the council only appears in your token after a refresh. TideCloak can take up to two minutes.">
          <div className="row">
            <Button busy={busy === "refresh"} onClick={refresh}>Refresh session</Button>
            <Badge tone={roles.releaser ? "ok" : undefined}>{roles.releaser ? "exam-releaser in token" : "no exam-releaser yet"}</Badge>
          </div>
          {refreshedAt && <p className="small muted" style={{ marginTop: 8 }}>Refreshed at {time(refreshedAt)}</p>}
          {confirmNote && <p className="small muted" style={{ marginTop: 4 }}>{confirmNote}</p>}
        </Card>

        <Card title="4. Open the paper" sub="Decrypts in this browser. The Tide network checks your roles on every request. You can try at any time.">
          <Button variant={roles.releaser ? "primary" : undefined} big busy={busy === "open"} disabled={!sealedCount} onClick={open}>
            Open paper
          </Button>
        </Card>
      </div>

      {refusal && (
        <Notice tone="danger" title="Refused by the Tide network">
          {refusal}
        </Notice>
      )}
      {error && <Notice tone="danger" title="Something went wrong">{error}</Notice>}

      {opened ? (
        <div className="paper">
          <h2>{paper?.paper.title}</h2>
          <p className="meta">{paper?.paper.site} · opened {time(openedAt)} · synthetic questions</p>
          <ol>
            {opened.map((q, i) => (
              <li key={i}>
                {q.text}
                <div className="opts">
                  {q.options.map((o, j) => <span key={j}>{"ABCD"[j]}. {o}</span>)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="sealed-envelope">
          <div className="seal-mark">✦</div>
          <h3>Sealed</h3>
          <p className="muted">{sealedCount} encrypted question(s) on this site. No key exists here or on the server.</p>
        </div>
      )}
    </div>
  );
}

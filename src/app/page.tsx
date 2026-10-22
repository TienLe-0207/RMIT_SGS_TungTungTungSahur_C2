"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Notice, PersonaChip, time } from "@/components/ui";
import { useApi, useMe, usePoll, type PaperView } from "@/lib/client/hooks";

export default function HomePage() {
  const { tc, username, roles } = useMe();
  const api = useApi();
  const [paper, setPaper] = useState<PaperView | null>(null);

  usePoll(async () => setPaper(await api<PaperView>("/api/paper")), 5000, tc.authenticated);

  if (tc.isInitializing) return <p className="muted">Connecting to Tide…</p>;

  if (!tc.authenticated) {
    return (
      <>
        <div className="hero">
          <div className="seal-mark" style={{ width: 72, height: 72, fontSize: 32, margin: "0 auto 18px" }}>✦</div>
          <h1>SealedExam</h1>
          <p className="tagline">Nobody can leak the exam alone, because nobody holds the key alone.</p>
          <p className="lead">
            National exam papers travel to exam sites early and encrypted. Not the ministry, not the IT operator, not this
            platform can open one before the bell. Opening takes a council quorum, enforced by the Tide network.
          </p>
          <Button variant="primary" big onClick={() => tc.login()}>Sign in with Tide</Button>
        </div>
        <div className="grid three">
          <Card title="Sealed in the browser" sub="Setters encrypt questions before they leave the device. The server stores ciphertext only." />
          <Card title="Opened only by quorum" sub="The release role is granted only when 2 of 3 council members sign. Nobody can grant it to themselves." />
          <Card title="Every step on the record" sub="Requests, approvals, refusals and openings are logged with who and when." />
        </div>
        <p className="muted small" style={{ textAlign: "center", marginTop: 24 }}>
          Prototype. All people, exams and questions are fictional.
        </p>
      </>
    );
  }

  const next: { href: string; label: string; text: string }[] = [];
  if (roles.setter) next.push({ href: "/setter", label: "Seal questions", text: "Encrypt questions into the paper. You will not be able to reopen them." });
  if (roles.proctor) next.push({ href: "/room", label: "Exam room", text: "Ring the bell, request release, and open the paper once the council approves." });
  if (roles.council) next.push({ href: "/council", label: "Council", text: "Review release requests and sign approvals in the Tide enclave." });
  if (roles.council || roles.operator) next.push({ href: "/operator", label: "Operator view", text: "See exactly what the platform stores." });
  next.push({ href: "/audit", label: "Audit trail", text: "Who did what, and when." });

  const sealed = paper?.questions.length ?? 0;
  const policiesReady = !!(paper?.policies.write && paper?.policies.read);

  return (
    <div className="stack">
      <Card
        title={<span className="row">Signed in as <PersonaChip username={username} /></span>}
        sub="Your roles come from your TideCloak token. Role changes take effect after you refresh your session."
      >
        <div className="row">
          <Button onClick={() => tc.forceRefreshToken()}>Refresh my session</Button>
        </div>
      </Card>

      {paper && (
        <Card
          title={paper.paper.title}
          sub={paper.paper.site}
          tone="gold"
          aside={paper.paper.bellRungAt ? <Badge tone="warn">Bell rung {time(paper.paper.bellRungAt)}</Badge> : <Badge tone="gold">Sealed</Badge>}
        >
          <div className="row">
            <Badge tone={sealed ? "ok" : undefined}>{sealed} question(s) sealed</Badge>
            <Badge tone={policiesReady ? "ok" : "warn"}>{policiesReady ? "Paper policies signed" : "Paper policies not signed yet"}</Badge>
          </div>
        </Card>
      )}

      <div className="grid two">
        {next.map((n) => (
          <Card key={n.href} title={<Link href={n.href}>{n.label} →</Link>} sub={n.text} />
        ))}
      </div>

      {!roles.setter && !roles.proctor && !roles.council && !roles.operator && (
        <Notice tone="info" title="No SealedExam role yet">
          Ask the council to assign your role, then refresh your session.
        </Notice>
      )}
    </div>
  );
}

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
          <h1>Deliver and open sealed exam papers</h1>
          <p className="tagline">Nobody can leak the exam alone, because nobody holds the key alone.</p>
          <p className="lead">
            Exam papers travel to exam sites early and encrypted. The ministry, the IT operator and this platform cannot
            open one before the bell. Opening takes a council quorum, enforced by the Tide network.
          </p>
          <Button variant="primary" big onClick={() => tc.login()}>Start now ▸</Button>
        </div>

        <div className="grid two">
          <Card title="How it works">
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              <li style={{ marginBottom: 8 }}><strong>Setters seal questions</strong> in their own browser. The server only ever stores ciphertext.</li>
              <li style={{ marginBottom: 8 }}><strong>At the exam bell</strong>, the proctor asks the council to release the paper.</li>
              <li style={{ marginBottom: 8 }}><strong>Council members approve</strong> by signing. One member alone cannot grant release, not even to themselves.</li>
              <li><strong>The proctor opens the paper</strong> once the quorum is met. Every step goes on the audit trail.</li>
            </ol>
          </Card>
          <Card title="Before you start">
            <p>You need a SealedExam role: question setter, council member, proctor or IT operator.</p>
            <p>Each person signs in with Tide in their own browser profile.</p>
            <p className="small muted" style={{ margin: 0 }}>All people, exams and questions in this prototype are fictional.</p>
          </Card>
        </div>
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

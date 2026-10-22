"use client";

import { useState } from "react";
import { Badge, Button, Card, Cipher, Gate, Notice, PageHead } from "@/components/ui";
import { useAction, useApi, usePoll, type PaperView } from "@/lib/client/hooks";
import { SAMPLE_QUESTIONS, type Question } from "@/lib/samplePaper";
import { openQuestions, sealQuestions } from "@/lib/tide/paper";
import { explainTideError } from "@/lib/tide/iga";

const LETTERS = ["A", "B", "C", "D"] as const;

export default function SetterPage() {
  return (
    <>
      <PageHead title="Seal questions">
        Questions are encrypted in this browser before they are sent. The server only ever receives ciphertext, and the
        paper&apos;s policy lets setters write into it, never read from it.
      </PageHead>
      <Gate who="question setters (exam-setter)" allow={(r) => r.setter}>
        <Setter />
      </Gate>
    </>
  );
}

function Setter() {
  const api = useApi();
  const { busy, error, run } = useAction();
  const [paper, setPaper] = useState<PaperView | null>(null);
  const [drafts, setDrafts] = useState<Question[]>(SAMPLE_QUESTIONS);
  const [sealedNow, setSealedNow] = useState<{ count: number; sample: string } | null>(null);
  const [reopen, setReopen] = useState<{ ok: boolean; message: string } | null>(null);
  const [form, setForm] = useState<Question>({ text: "", options: ["", "", "", ""], answer: "A" });

  const load = async () => setPaper(await api<PaperView>("/api/paper"));
  usePoll(load, 6000);

  const writePolicy = paper?.policies.write;

  const seal = () =>
    run("seal", async () => {
      if (!paper || !writePolicy) throw new Error("The council has not signed the paper's write policy yet.");
      const ciphertexts = await sealQuestions(drafts, paper.paper.id, writePolicy).catch((err) => {
        throw new Error(explainTideError(err).message);
      });
      await api("/api/questions", { method: "POST", body: { ciphertexts } });
      setSealedNow({ count: ciphertexts.length, sample: ciphertexts[0] });
      setDrafts([]);
      setReopen(null);
      await load();
    });

  const tryReopen = () =>
    run("reopen", async () => {
      if (!paper?.questions.length) throw new Error("Nothing sealed yet.");
      if (!paper.policies.read) throw new Error("The paper's read policy is not signed yet, so there is nothing to try with.");
      try {
        const qs = await openQuestions(paper.questions.map((q) => q.ciphertext), paper.paper.id, paper.policies.read);
        setReopen({ ok: true, message: `Decrypted ${qs.length} question(s). This should not happen for a setter: check the roles.` });
        await api("/api/audit", { method: "POST", body: { action: "paper_decrypted", details: "Setter decrypted the paper (unexpected)" } });
      } catch (err) {
        const e = explainTideError(err);
        setReopen({ ok: false, message: e.message });
        await api("/api/audit", { method: "POST", body: { action: "decrypt_denied", details: `Setter tried to reopen the paper. ${e.message}`.slice(0, 300) } });
      }
    });

  const addDraft = () => {
    if (!form.text.trim() || form.options.some((o) => !o.trim())) return;
    setDrafts((d) => [...d, { ...form, options: [...form.options] as Question["options"] }]);
    setForm({ text: "", options: ["", "", "", ""], answer: "A" });
  };

  return (
    <div className="stack">
      {paper && !writePolicy && (
        <Notice tone="warn" title="Waiting for the council">
          A council member has to sign the paper&apos;s write policy before anything can be sealed into it.
        </Notice>
      )}

      {sealedNow && (
        <Notice tone="ok" title={`Sealed ${sealedNow.count} question(s). Not even you can reopen them.`}>
          <p className="small">This is what left your browser for the first one:</p>
          <Cipher text={sealedNow.sample} />
        </Notice>
      )}

      <div className="grid two">
        <Card
          title="Draft (only in this browser)"
          sub="Synthetic questions written for this demo. They are encrypted here; the plaintext is never sent."
          aside={<Badge>{drafts.length} draft(s)</Badge>}
        >
          {drafts.length === 0 ? (
            <p className="muted">No drafts. Add one on the right.</p>
          ) : (
            <ol style={{ paddingLeft: 20, margin: "0 0 14px" }}>
              {drafts.map((q, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {q.text} <span className="muted small">({q.options.length} options)</span>
                </li>
              ))}
            </ol>
          )}
          <div className="row">
            <Button variant="primary" big busy={busy === "seal"} disabled={!drafts.length || !writePolicy} onClick={seal}>
              Seal {drafts.length} question(s)
            </Button>
            {drafts.length > 0 && <Button variant="ghost" onClick={() => setDrafts([])}>Clear drafts</Button>}
          </div>
        </Card>

        <Card title="Write a question" sub="Four options, one correct answer.">
          <div className="field">
            <label htmlFor="q-text">Question</label>
            <textarea id="q-text" rows={2} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          </div>
          {LETTERS.map((l, i) => (
            <div className="field" key={l}>
              <label htmlFor={`q-opt-${l}`}>Option {l}</label>
              <input
                id={`q-opt-${l}`}
                value={form.options[i]}
                onChange={(e) => {
                  const options = [...form.options] as Question["options"];
                  options[i] = e.target.value;
                  setForm({ ...form, options });
                }}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="q-answer">Correct answer</label>
            <select id="q-answer" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value as Question["answer"] })}>
              {LETTERS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <Button onClick={addDraft}>Add to draft</Button>
        </Card>
      </div>

      <Card
        title="Try to reopen the sealed paper"
        sub="You wrote these questions. Can you read them back now that they are sealed? The Tide network decides, not this page."
        aside={<Badge tone="gold">{paper?.questions.length ?? 0} sealed in the paper</Badge>}
      >
        <Button busy={busy === "reopen"} onClick={tryReopen}>Try to reopen</Button>
        {reopen && (
          <div style={{ marginTop: 12 }}>
            <Notice tone={reopen.ok ? "warn" : "danger"} title={reopen.ok ? "Opened" : "Refused by the Tide network"}>
              {reopen.message}
            </Notice>
          </div>
        )}
      </Card>

      {error && <Notice tone="danger" title="Something went wrong">{error}</Notice>}
    </div>
  );
}

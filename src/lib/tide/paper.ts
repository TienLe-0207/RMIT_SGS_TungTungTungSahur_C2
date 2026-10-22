"use client";

import { IAMService } from "@tidecloak/js";
import type { Question } from "../samplePaper";

// The paper is ONE record for the RelationshipAttestation contract: every question carries exactly
// one tag, the paper id. Any second tag is refused by the network (AP-RA03).

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};

export async function sealQuestions(questions: Question[], paperId: string, writePolicyB64: string): Promise<string[]> {
  const out = await IAMService.doEncrypt(
    questions.map((q) => ({ data: JSON.stringify(q), tags: [paperId] })),
    fromBase64(writePolicyB64)
  );
  return (out as (string | Uint8Array)[]).map((c) => (typeof c === "string" ? c : toBase64(c)));
}

export async function openQuestions(ciphertexts: string[], paperId: string, readPolicyB64: string): Promise<Question[]> {
  const out = await IAMService.doDecrypt(
    ciphertexts.map((encrypted) => ({ encrypted, tags: [paperId] })),
    fromBase64(readPolicyB64)
  );
  return (out as (string | Uint8Array)[]).map((p) => JSON.parse(typeof p === "string" ? p : new TextDecoder().decode(p)));
}

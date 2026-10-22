"use client";

import { IAMService } from "@tidecloak/js";
import type { Question } from "../samplePaper";
import { SIMULATED } from "./mode";
import { simNetwork } from "./sim/client";

// The paper is ONE record for the RelationshipAttestation contract: every question carries exactly
// one tag, the paper id. Any second tag is refused by the network (AP-RA03).
// In simulated mode the same calls go to the simulated Tide network with this user's own token.

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};

export async function sealQuestions(questions: Question[], paperId: string, writePolicyB64: string): Promise<string[]> {
  const items = questions.map((q) => ({ data: JSON.stringify(q), tags: [paperId] }));
  if (SIMULATED) return (await simNetwork<{ items: string[] }>("encrypt", { items, policy: writePolicyB64 })).items;
  const out = await IAMService.doEncrypt(items, fromBase64(writePolicyB64));
  return (out as (string | Uint8Array)[]).map((c) => (typeof c === "string" ? c : toBase64(c)));
}

export async function openQuestions(ciphertexts: string[], paperId: string, readPolicyB64: string): Promise<Question[]> {
  const items = ciphertexts.map((encrypted) => ({ encrypted, tags: [paperId] }));
  if (SIMULATED) {
    return (await simNetwork<{ items: string[] }>("decrypt", { items, policy: readPolicyB64 })).items.map((p) => JSON.parse(p));
  }
  const out = await IAMService.doDecrypt(items, fromBase64(readPolicyB64));
  return (out as (string | Uint8Array)[]).map((p) => JSON.parse(typeof p === "string" ? p : new TextDecoder().decode(p)));
}

import { withRealmRole } from "@/lib/auth/protect";
import { actorName } from "@/lib/auth/actor";
import { audit, newId, updateStore, PAPER_ID } from "@/lib/store";

// Setters hand in ciphertext only. The server cannot check what is inside, and does not try.
export const POST = withRealmRole("exam-setter", async (req, jwt) => {
  const body = await req.json().catch(() => null);
  const items: unknown = body?.ciphertexts;
  if (!Array.isArray(items) || items.length === 0 || items.length > 50 || !items.every((c) => typeof c === "string" && c.length > 0)) {
    return Response.json({ error: "Expected { ciphertexts: string[] }" }, { status: 400 });
  }
  const actor = actorName(jwt);
  const ids = updateStore((s) => {
    const created = (items as string[]).map((ciphertext) => ({
      id: newId(),
      paperId: PAPER_ID,
      author: actor,
      ciphertext,
      createdAt: new Date().toISOString(),
      status: "sealed" as const,
    }));
    s.questions.push(...created);
    audit(s, actor, "sealed", `${created.length} question(s) sealed into ${PAPER_ID}`);
    return created.map((q) => q.id);
  });
  return Response.json({ ids });
});

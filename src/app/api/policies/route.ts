import { withRole } from "@/lib/auth/protect";
import { actorName } from "@/lib/auth/actor";
import { audit, updateStore } from "@/lib/store";

// Store the two network-signed RelationshipAttestation policies for the paper.
// Council only. The bytes are useless without the network's signature, but an open route would
// let anyone overwrite a good policy with junk and lock the paper (AP-RA08).
export const POST = withRole("tide-realm-admin", async (req, jwt) => {
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const policy = body?.policy;
  if ((kind !== "write" && kind !== "read") || typeof policy !== "string" || !/^[A-Za-z0-9+/=]+$/.test(policy)) {
    return Response.json({ error: "Expected { kind: 'write' | 'read', policy: base64 }" }, { status: 400 });
  }
  const actor = actorName(jwt);
  updateStore((s) => {
    s.policies[kind as "write" | "read"] = policy;
    s.policies.signedBy = actor;
    s.policies.signedAt = new Date().toISOString();
    audit(s, actor, "policy_signed", kind === "write" ? "Setters may seal into the paper (write-only)" : "exam-releaser may open the paper (read-only)");
  });
  return Response.json({ ok: true });
});

import { withAuth } from "@/lib/auth/protect";
import { actorName, isCouncil } from "@/lib/auth/actor";
import { audit, readStore, updateStore } from "@/lib/store";

export const GET = withAuth(async () => {
  return Response.json({ audit: readStore().audit });
});

// Events only the browser can observe (a decrypt succeeded or the network refused it).
// The actor comes from the verified token; the event itself is labelled client-reported,
// because the server cannot verify what happened in the browser. Approvals in particular are
// only a hint here: the authoritative record is the change request's authorizers in TideCloak,
// which the audit page reads directly.
// Value: whether the caller must be on the council to report it.
const CLIENT_ACTIONS: Record<string, boolean> = {
  paper_decrypted: false,
  decrypt_denied: false,
  self_grant_attempt: true,
  approval_signed: true,
};

export const POST = withAuth(async (req, jwt) => {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const details = typeof body?.details === "string" ? body.details.slice(0, 300) : undefined;
  if (typeof action !== "string" || !(action in CLIENT_ACTIONS)) {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }
  if (CLIENT_ACTIONS[action] && !isCouncil(jwt)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  updateStore((s) => audit(s, actorName(jwt), action, details, "client-reported"));
  return Response.json({ ok: true });
});

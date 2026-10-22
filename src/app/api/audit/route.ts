import { withAuth } from "@/lib/auth/protect";
import { actorName } from "@/lib/auth/actor";
import { audit, readStore, updateStore } from "@/lib/store";

export const GET = withAuth(async () => {
  return Response.json({ audit: readStore().audit });
});

// Events only the browser can observe (a decrypt succeeded or the network refused it).
// The actor comes from the verified token; the event itself is labelled client-reported,
// because the server cannot verify what happened in the browser.
const CLIENT_ACTIONS = new Set([
  "paper_decrypted",
  "decrypt_denied",
  "self_grant_attempt",
  "approval_signed",
]);

export const POST = withAuth(async (req, jwt) => {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const details = typeof body?.details === "string" ? body.details.slice(0, 300) : undefined;
  if (!CLIENT_ACTIONS.has(action)) {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }
  updateStore((s) => audit(s, actorName(jwt), action, details, "client-reported"));
  return Response.json({ ok: true });
});

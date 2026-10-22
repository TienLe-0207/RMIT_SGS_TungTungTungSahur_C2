import { withAuth } from "@/lib/auth/protect";
import { actorName, hasAnyRole } from "@/lib/auth/actor";
import { audit, readStore, updateStore } from "@/lib/store";

// One audit line per actor per window, so reloading the page does not flood the trail.
const VIEW_AUDIT_WINDOW_MS = 5 * 60 * 1000;

// The operator view: exactly what the platform stores, unfiltered.
export const GET = withAuth(async (_req, jwt) => {
  if (!hasAnyRole(jwt, ["it-operator", "tide-realm-admin"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = actorName(jwt);
  const last = [...readStore().audit].reverse().find((e) => e.actor === actor && e.action === "operator_viewed");
  if (!last || Date.now() - Date.parse(last.ts) > VIEW_AUDIT_WINDOW_MS) {
    updateStore((s) => audit(s, actor, "operator_viewed", "Opened the raw vault"));
  }
  return Response.json(readStore());
});

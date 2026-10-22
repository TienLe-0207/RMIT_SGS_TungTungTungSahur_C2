import { withAccess } from "@/lib/auth/protect";
import { actorName, isCouncil, isOperator } from "@/lib/auth/actor";
import { audit, readStore, updateStore } from "@/lib/store";

// One audit line per actor per window, so reloading the page does not flood the trail.
const VIEW_AUDIT_WINDOW_MS = 5 * 60 * 1000;

// The operator view: exactly what the platform stores, unfiltered.
export const GET = withAccess((jwt) => isOperator(jwt) || isCouncil(jwt), async (_req, jwt) => {
  const actor = actorName(jwt);
  updateStore((s) => {
    const since = Date.now() - VIEW_AUDIT_WINDOW_MS;
    const recent = s.audit.some((e) => e.action === "operator_viewed" && e.actor === actor && Date.parse(e.ts) > since);
    if (!recent) audit(s, actor, "operator_viewed", "Opened the raw vault");
  });
  return Response.json(readStore());
});

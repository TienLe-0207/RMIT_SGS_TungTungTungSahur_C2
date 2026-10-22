import { withAccess } from "@/lib/auth/protect";
import { actorName, isCouncil, isOperator } from "@/lib/auth/actor";
import { audit, readStore, updateStore } from "@/lib/store";

// One audit line per actor per window, so reloading the page does not flood the trail.
const VIEW_AUDIT_WINDOW_MS = 5 * 60 * 1000;

// The operator view: exactly what the platform stores, unfiltered.
export const GET = withAccess((jwt) => isOperator(jwt) || isCouncil(jwt), async (_req, jwt) => {
  updateStore((s) => audit(s, actorName(jwt), "operator_viewed", "Opened the raw vault"));
  return Response.json(readStore());
});

import { withAccess } from "@/lib/auth/protect";
import { actorName, isCouncil, isOperator } from "@/lib/auth/actor";
import { audit, readStore, updateStore } from "@/lib/store";

// The operator view: exactly what the platform stores, unfiltered.
export const GET = withAccess((jwt) => isOperator(jwt) || isCouncil(jwt), async (_req, jwt) => {
  updateStore((s) => audit(s, actorName(jwt), "operator_viewed", "Opened the raw vault"));
  return Response.json(readStore());
});

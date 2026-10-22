import { withAuth } from "@/lib/auth/protect";
import { actorName, hasAnyRole } from "@/lib/auth/actor";
import { audit, readStore, updateStore } from "@/lib/store";

// The operator view: exactly what the platform stores, unfiltered.
export const GET = withAuth(async (_req, jwt) => {
  if (!hasAnyRole(jwt, ["it-operator", "tide-realm-admin"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  updateStore((s) => audit(s, actorName(jwt), "operator_viewed", "Opened the raw vault"));
  return Response.json(readStore());
});

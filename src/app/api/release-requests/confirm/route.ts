import { withRealmRole } from "@/lib/auth/protect";
import { RELEASE_ROLES, actorName, hasReleaseRights } from "@/lib/auth/actor";
import { audit, updateStore } from "@/lib/store";
import { latestRequestFor } from "@/lib/release";

// The proctor calls this after refreshing their session. It is the one place the app records a
// grant as TideCloak-confirmed: the evidence is the proctor's own access token, signed by TideCloak
// and already verified by withAuth, now carrying the release roles. TideCloak only puts them there
// once the change request committed, i.e. once the council quorum signed.
export const POST = withRealmRole("proctor", async (_req, jwt) => {
  if (!hasReleaseRights(jwt)) {
    return Response.json(
      { effective: false, error: `Grant not effective yet: the session token does not carry ${RELEASE_ROLES.join(" + ")}` },
      { status: 409 }
    );
  }
  const actor = actorName(jwt);
  const userId = String(jwt.sub);
  const issuedAt = typeof jwt.iat === "number" ? new Date(jwt.iat * 1000).toISOString() : "unknown";
  const request = updateStore((s) => {
    const r = latestRequestFor(s.releaseRequests, userId);
    if (r?.grantConfirmedAt) return r;
    if (!r && s.audit.some((e) => e.action === "release_granted" && e.actor === actor && e.source === "tidecloak")) return null;
    if (r) r.grantConfirmedAt = new Date().toISOString();
    // No release request on record means the roles arrived some other way. Still record it: that is
    // exactly what the audit trail is for.
    const context = r ? `for release request ${r.id.slice(0, 8)}` : "with NO release request on record";
    audit(s, actor, "release_granted", `TideCloak-signed token (issued ${issuedAt}) carries ${RELEASE_ROLES.join(" + ")}, ${context}`, "tidecloak");
    return r ?? null;
  });
  return Response.json({ effective: true, request });
});

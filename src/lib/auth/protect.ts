import { NextRequest } from "next/server";
import { verifyTideJWT, hasRealmRole, extractToken } from "./tideJWT";
import { verifyDpop } from "./verifyDpop";
import type { JWTPayload } from "jose";

// Playbook: verify-jwt-server-side Step 5
type AuthHandler = (req: NextRequest, jwt: JWTPayload) => Promise<Response>;

export function withAuth(handler: AuthHandler) {
  return async (req: NextRequest) => {
    try {
      const token = extractToken(req.headers.get("authorization"));
      const jwt = await verifyTideJWT(token);
      // The signature alone is not enough. This realm issues sender-constrained tokens (cnf.jkt),
      // and without checking the DPoP proof a stolen token replays as a plain `Bearer` and passes
      // (AP-43). verifyDpop rejects an unbound token, a Bearer-scheme replay, a proof signed by a
      // different key, and a proof for another URL or method. It throws; the catch below answers 401.
      await verifyDpop(req, token, jwt as { cnf?: { jkt?: string } });
      return handler(req, jwt);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Unauthorized" },
        { status: 401 }
      );
    }
  };
}

// Authorization on top of withAuth: 403 unless `allowed` holds for the verified token.
export function withAccess(allowed: (jwt: JWTPayload) => boolean, handler: AuthHandler) {
  return withAuth(async (req, jwt) => {
    if (!allowed(jwt)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(req, jwt);
  });
}

// App roles (exam-setter, proctor, ...) are realm roles. Client roles go through withAccess with an
// explicit client, e.g. isCouncil.
export function withRealmRole(role: string, handler: AuthHandler) {
  return withAccess((jwt) => hasRealmRole(jwt, role), handler);
}

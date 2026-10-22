import type { JWTPayload } from "jose";
import { hasClientRole, hasRealmRole } from "./tideJWT";

// Who made the request, from the VERIFIED token. Never from the request body.
export function actorName(jwt: JWTPayload): string {
  return String((jwt as any).preferred_username ?? jwt.sub ?? "unknown");
}

// Council members are the realm's IGA approvers: the `tide-realm-admin` client role on
// `realm-management`. A role with the same name on any other client (or as a realm role) is not
// the approver role and must not count.
export const COUNCIL_CLIENT = "realm-management";
export const COUNCIL_ROLE = "tide-realm-admin";

export const isCouncil = (jwt: JWTPayload) => hasClientRole(jwt, COUNCIL_CLIENT, COUNCIL_ROLE);

export const isOperator = (jwt: JWTPayload) => hasRealmRole(jwt, "it-operator");

// The right to open the paper: both realm roles, granted together by one quorum-approved change request.
export const RELEASE_ROLES = ["exam-releaser", "_tide_decryptor"] as const;

export const hasReleaseRights = (jwt: JWTPayload) => RELEASE_ROLES.every((r) => hasRealmRole(jwt, r));

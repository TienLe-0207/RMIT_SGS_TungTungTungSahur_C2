import type { JWTPayload } from "jose";
import { hasRole } from "./tideJWT";

// Who made the request, from the VERIFIED token. Never from the request body.
export function actorName(jwt: JWTPayload): string {
  return String((jwt as any).preferred_username ?? jwt.sub ?? "unknown");
}

export const isCouncil = (jwt: JWTPayload) => hasRole(jwt, "tide-realm-admin");

export function hasAnyRole(jwt: JWTPayload, roles: string[]): boolean {
  return roles.some((r) => hasRole(jwt, r));
}

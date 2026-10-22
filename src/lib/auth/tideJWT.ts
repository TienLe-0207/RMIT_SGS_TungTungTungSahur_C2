import { jwtVerify, createLocalJWKSet } from "jose";
import type { JWTPayload } from "jose";
import { loadTideConfig } from "./tidecloakConfig";

// Lazy initialization — do NOT load config at module level.
// Next.js 16 evaluates module-level code during `next build` for static
// page generation. If tidecloak.json doesn't exist yet (placeholder or
// pre-bootstrap), eager loading throws at build time.
let _jwks: ReturnType<typeof createLocalJWKSet> | null = null;
let _config: ReturnType<typeof loadTideConfig> | null = null;

function getConfig() {
  if (!_config) {
    _config = loadTideConfig();
    if (!_config.jwk) {
      throw new Error(
        "Adapter JSON missing jwk field. Re-export with IGA enabled."
      );
    }
    _jwks = createLocalJWKSet(_config.jwk);
  }
  return { config: _config, JWKS: _jwks! };
}

export async function verifyTideJWT(token: string): Promise<JWTPayload> {
  const { config, JWKS } = getConfig();
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${config["auth-server-url"].replace(/\/+$/, "")}/realms/${config.realm}`,
  });

  if (payload.azp !== config.resource) {
    throw new Error("Token azp does not match client");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Token expired");
  }
  if (payload.iat && payload.iat > now + 60) {
    throw new Error("Token issued in future");
  }

  return payload;
}

// Realm roles and client roles are separate namespaces. A role name alone does not identify a role:
// any client can define its own `tide-realm-admin`, so client roles are always checked against the
// client that owns them, never by searching every client in resource_access.
export function hasRealmRole(payload: JWTPayload, role: string): boolean {
  const roles = (payload.realm_access as any)?.roles;
  return Array.isArray(roles) && roles.includes(role);
}

export function hasClientRole(payload: JWTPayload, clientId: string, role: string): boolean {
  const resourceAccess = payload.resource_access as any;
  if (!resourceAccess || !Object.prototype.hasOwnProperty.call(resourceAccess, clientId)) return false;
  const roles = resourceAccess[clientId]?.roles;
  return Array.isArray(roles) && roles.includes(role);
}

export function extractToken(authHeader: string | null): string {
  if (!authHeader) throw new Error("Missing Authorization header");
  if (authHeader.startsWith("Bearer ")) return authHeader.substring(7);
  if (authHeader.startsWith("DPoP ")) return authHeader.substring(5);
  throw new Error("Invalid Authorization header format");
}

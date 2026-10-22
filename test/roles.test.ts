import { describe, expect, it } from "vitest";
import type { JWTPayload } from "jose";
import { hasClientRole, hasRealmRole } from "@/lib/auth/tideJWT";
import { isCouncil, isOperator } from "@/lib/auth/actor";

const jwt = (realm: string[], clients: Record<string, string[]> = {}): JWTPayload => ({
  realm_access: { roles: realm },
  resource_access: Object.fromEntries(Object.entries(clients).map(([c, roles]) => [c, { roles }])),
});

describe("hasRealmRole", () => {
  it("matches a realm role", () => {
    expect(hasRealmRole(jwt(["proctor"]), "proctor")).toBe(true);
  });

  it("ignores a client role with the same name", () => {
    expect(hasRealmRole(jwt([], { "sealedexam-app": ["proctor"] }), "proctor")).toBe(false);
  });

  it("is false when realm_access is missing or malformed", () => {
    expect(hasRealmRole({}, "proctor")).toBe(false);
    expect(hasRealmRole({ realm_access: { roles: "proctor" } }, "proctor")).toBe(false);
  });
});

describe("hasClientRole", () => {
  it("matches only on the named client", () => {
    const t = jwt([], { "realm-management": ["tide-realm-admin"] });
    expect(hasClientRole(t, "realm-management", "tide-realm-admin")).toBe(true);
    expect(hasClientRole(t, "account", "tide-realm-admin")).toBe(false);
  });

  it("ignores a realm role with the same name", () => {
    expect(hasClientRole(jwt(["tide-realm-admin"]), "realm-management", "tide-realm-admin")).toBe(false);
  });

  it("does not resolve inherited object keys as client ids", () => {
    expect(hasClientRole(jwt([]), "constructor", "tide-realm-admin")).toBe(false);
  });
});

describe("isCouncil", () => {
  it("is true for tide-realm-admin on realm-management", () => {
    expect(isCouncil(jwt([], { "realm-management": ["tide-realm-admin"] }))).toBe(true);
  });

  it("is false for tide-realm-admin on any other client", () => {
    expect(isCouncil(jwt([], { "evil-client": ["tide-realm-admin"] }))).toBe(false);
  });

  it("is false for a realm role named tide-realm-admin", () => {
    expect(isCouncil(jwt(["tide-realm-admin"]))).toBe(false);
  });

  it("is false for other realm-management roles", () => {
    expect(isCouncil(jwt([], { "realm-management": ["view-users", "manage-users"] }))).toBe(false);
  });
});

describe("isOperator", () => {
  it("needs the it-operator realm role", () => {
    expect(isOperator(jwt(["it-operator"]))).toBe(true);
    expect(isOperator(jwt([], { "sealedexam-app": ["it-operator"] }))).toBe(false);
  });
});

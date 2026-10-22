import type { NextRequest } from "next/server";
import type { JWTPayload } from "jose";
import { withAuth } from "@/lib/auth/protect";
import { isCouncil } from "@/lib/auth/actor";
import {
  CONTRACT_ID, NetworkRefusal, checkAccess, decrypt, encrypt, readPolicy, readSim, signPolicy,
} from "@/lib/sim-tide/state";

// SIMULATED Tide network, running the RelationshipAttestation:1 rules. The caller's own DPoP-bound
// token is what it checks, exactly as the ORKs check the doken: the SealedExam server never calls
// this and holds no key for it.

const realmRoles = (jwt: JWTPayload) => ((jwt.realm_access as any)?.roles ?? []) as string[];

// The same shape the real SDK raises: a threshold failure, with the contract's reason in `cause`.
const refuse = (reason: string) =>
  Response.json({ error: "TIDE-TIDEJS-NET-THRESHOLD_FAILURE: got 0 of 3 (simulated network)", cause: reason }, { status: 403 });

export const POST = withAuth(async (req: NextRequest, jwt) => {
  const op = req.nextUrl.pathname.split("/").pop();
  const body = await req.json().catch(() => null);
  const s = readSim();
  try {
    if (op === "sign-policy") {
      if (!isCouncil(jwt)) throw new NetworkRefusal("Only a realm admin can sign a policy.");
      const { subjectId, recordId, access } = body ?? {};
      if (typeof subjectId !== "string" || typeof recordId !== "string" || (access !== "read" && access !== "write")) {
        return Response.json({ error: "Expected { subjectId, recordId, access }" }, { status: 400 });
      }
      const policy = signPolicy(s, {
        contractId: CONTRACT_ID, subjectType: "Role", subjectId, assignmentId: recordId,
        roles: [access === "write" ? "_tide_encryptor" : "_tide_decryptor"],
        signedBy: String((jwt as any).preferred_username), signedAt: new Date().toISOString(),
      });
      return Response.json({ policy });
    }

    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items || typeof body?.policy !== "string") return Response.json({ error: "Expected { items, policy }" }, { status: 400 });
    const policy = readPolicy(s, body.policy);

    if (op === "encrypt") {
      const out = items.map((it: any) => {
        checkAccess(policy, realmRoles(jwt), "_tide_encryptor", it?.tags ?? []);
        return encrypt(s, policy.assignmentId, String(it.data));
      });
      return Response.json({ items: out });
    }
    if (op === "decrypt") {
      const out = items.map((it: any) => {
        checkAccess(policy, realmRoles(jwt), "_tide_decryptor", it?.tags ?? []);
        return decrypt(s, policy.assignmentId, String(it.encrypted));
      });
      return Response.json({ items: out });
    }
    return Response.json({ error: "Unknown operation" }, { status: 404 });
  } catch (err) {
    if (err instanceof NetworkRefusal) return refuse(err.message);
    throw err;
  }
});

export const dynamic = "force-dynamic";

import { calculateJwkThumbprint, type JWK } from "jose";
import { issueToken, readSim } from "@/lib/sim-tide/state";

// SIMULATED sign-in. Real Tide login proves the user holds their Tide key in the enclave; here,
// picking a persona stands in for that. The token is still DPoP-bound to the browser's own key.
// Also used for "refresh session": roles are read fresh, so a committed grant shows up here.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const jwk = body?.jwk as JWK | undefined;
  if (!jwk || jwk.kty !== "EC" || "d" in jwk) return Response.json({ error: "Expected { username, jwk: public EC key }" }, { status: 400 });
  const s = readSim();
  const user = s.users.find((u) => u.username === body?.username);
  if (!user) return Response.json({ error: "Unknown user" }, { status: 404 });
  const token = await issueToken(s, user, await calculateJwkThumbprint(jwk, "sha256"));
  return Response.json({ access_token: token, token_type: "DPoP" });
}

// The persona list for the sign-in page.
export async function GET() {
  return Response.json({ users: readSim().users.map(({ username, title }) => ({ username, title })) });
}

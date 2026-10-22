// Set up the SIMULATED TideCloak realm (see src/lib/sim-tide/state.ts).
//
//   npm run sim:init      new realm key, network key and the six demo personas; clears the app store
//                         (old ciphertext cannot be opened with a new network key)
//
// Writes data/sim-tide.json (the simulator's own state, private keys included) and
// data/tidecloak.json (the adapter the app verifies tokens with: public key only).
// Both are gitignored. All people here are fictional.
import { existsSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes, randomUUID } from "crypto";
import { exportJWK, generateKeyPair } from "jose";

const PORT = process.env.PORT ?? "3000";
const AUTH_SERVER = process.env.SIM_TIDE_URL ?? `http://localhost:${PORT}/sim-tide`;
const DATA = join(process.cwd(), "data");
mkdirSync(DATA, { recursive: true });

const council = { "realm-management": ["tide-realm-admin"] };
const users = [
  ["linh", "Question setter", ["exam-setter", "_tide_encryptor"], {}],
  ["minh", "Ministry representative", [], council],
  ["hoa", "Provincial council chair", [], council],
  ["tuan", "Exam site head", [], council],
  ["nam", "Proctor, Site A Room 12", ["proctor"], {}],
  ["quang", "IT operator", ["it-operator"], {}],
].map(([username, title, realmRoles, clientRoles]) => ({ id: randomUUID(), username, title, realmRoles, clientRoles }));

const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const kid = `sim-${randomUUID().slice(0, 8)}`;
const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
const privateJwk = { ...(await exportJWK(privateKey)), kid, alg: "ES256" };

writeFileSync(
  join(DATA, "sim-tide.json"),
  JSON.stringify(
    { authServerUrl: AUTH_SERVER, realmKey: { privateJwk, publicJwk }, networkKey: randomBytes(32).toString("base64"), users, changeRequests: [] },
    null,
    2
  )
);
writeFileSync(
  join(DATA, "tidecloak.json"),
  JSON.stringify(
    {
      realm: "sealedexam",
      "auth-server-url": AUTH_SERVER,
      "ssl-required": "none",
      resource: "sealedexam-app",
      "public-client": true,
      "confidential-port": 0,
      jwk: { keys: [publicJwk] },
      vendorId: "simulated-vendor",
      simulated: true,
    },
    null,
    2
  )
);
if (existsSync(join(DATA, "store.json"))) rmSync(join(DATA, "store.json"));

console.log(`Simulated TideCloak ready at ${AUTH_SERVER}`);
console.log(`Personas: ${users.map((u) => u.username).join(", ")}. Council threshold: 2 of 3.`);
console.log("Cleared data/store.json. Restart `npm run dev` so the app picks up the new adapter.");

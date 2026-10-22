// Reset the SealedExam demo so it can be rehearsed again.
//
//   npm run reset          clear the bell, release requests and audit trail; KEEP the sealed
//                          questions and the two signed paper policies (re-signing needs the enclave)
//   npm run reset -- --all delete data/store.json entirely (policies must be signed again)
//
// This only touches the app's own store. Roles live in TideCloak: if the proctor was granted
// exam-releaser in a previous run, revoke it from the Council page ("Demo tools"). On an IGA realm
// that revocation is itself a change request and needs the council quorum.
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const STORE_PATH = join(process.cwd(), "data", "store.json");
const all = process.argv.includes("--all");

if (!existsSync(STORE_PATH)) {
  console.log("Nothing to reset: data/store.json does not exist.");
  process.exit(0);
}

if (all) {
  rmSync(STORE_PATH);
  console.log("Deleted data/store.json. Sign the paper policies again from the Council page.");
} else {
  const s = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  s.paper.bellRungAt = null;
  s.releaseRequests = [];
  s.audit = [];
  writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
  console.log(`Reset bell, release requests and audit. Kept ${s.questions.length} sealed question(s) and the policies.`);
}
console.log("Reminder: revoke exam-releaser from the proctor in TideCloak if it was granted in an earlier run.");

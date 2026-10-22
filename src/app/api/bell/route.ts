import { withRealmRole } from "@/lib/auth/protect";
import { actorName } from "@/lib/auth/actor";
import { audit, updateStore } from "@/lib/store";

// MOCK exam bell. Pure app logic, not a time-lock: the quorum is the real control.
export const POST = withRealmRole("proctor", async (_req, jwt) => {
  const actor = actorName(jwt);
  const bellRungAt = updateStore((s) => {
    s.paper.bellRungAt = new Date().toISOString();
    audit(s, actor, "bell_rung", "Exam bell (mock) rung at the site");
    return s.paper.bellRungAt;
  });
  return Response.json({ bellRungAt });
});

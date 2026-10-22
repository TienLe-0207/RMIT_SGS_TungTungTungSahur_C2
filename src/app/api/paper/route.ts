import { withAuth } from "@/lib/auth/protect";
import { readStore } from "@/lib/store";

// Any signed-in user may fetch the sealed paper. Holding the ciphertext and the policies is not
// enough to open it: the Tide network checks the caller's roles on every decrypt.
export const GET = withAuth(async () => {
  const s = readStore();
  return Response.json({
    paper: s.paper,
    policies: s.policies,
    questions: s.questions.map(({ id, author, ciphertext, createdAt }) => ({ id, author, ciphertext, createdAt })),
  });
});

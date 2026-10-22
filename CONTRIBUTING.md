# Contributing

## Branches and pull requests

- Do not commit directly to `main`.
- One branch per task, named `<type>/<task>` with the same types as commit messages: `feat/exam-api`, `fix/dpop-retry`, `docs/readme`.
- Open a pull request; another team member reviews it before it is merged.

## Commit messages (in English)

Format: `<type>: <short description, imperative verb, no trailing full stop>`

| Type | Use for | Example |
|---|---|---|
| `feat` | New functionality | `feat: add exam API routes with server-side role checks` |
| `fix` | Bug fixes | `fix: make TideCloak init script run on macOS` |
| `test` | Adding or changing tests | `test: add auth, DPoP and route authorization tests` |
| `docs` | README, guides, diagrams | `docs: add README with project overview, architecture and setup` |
| `refactor` | Code changes that keep behaviour the same | `refactor: share role checks between API routes` |
| `chore` | Configuration, dependencies, cleanup | `chore: scaffold Next.js app from TideCloak template` |

One complete change per commit; avoid messages like `update`, `fix bug`, `final`.

## Before committing

```bash
npm test             # vitest: auth, DPoP, roles, routes, release flow
npx tsc --noEmit     # type check (needs data/tidecloak.json from `npm run init`)
```

## Do not commit

- `.env`: the TideCloak master-admin password and the Tide licence email.
- `data/`: the local TideCloak database, `tidecloak.json`, invite links, `store.json`.
- `.tide-pack/`, `node_modules/`, `.next/`.

All of these are already in `.gitignore`. Check `git status` before every commit anyway.

## Tide-provided files

Do not edit the files that come from the Tide template, for example `public/tide_dpop_auth.html`, `public/silent-check-sso.html`, `src/app/providers.tsx` and `src/lib/auth/verifyDpop.ts`. Changing them breaks sign-in.

## Bilingual README

`README.md` (English) and `README.vi.md` (Vietnamese) must have the same content.
Whenever you edit one, update the other in the same commit.

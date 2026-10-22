# SealedExam — Build Brief for the Coding Agent

> **Read this whole file before doing anything.** You have no prior context; everything you need is here.
> This brief contains design and instructions only — no code has been written yet.
> Items marked **VERIFY** are unconfirmed assumptions: check them with the Tide MCP before relying on them.

---

## 0. Ground rules (read first)

1. **Hard deadline: Thursday 22 Oct 2026, 18:00 Vietnam time (UTC+7).** Target submission at **17:30**. Scope is deliberately small. If something is not working by its time box, take the fallback in §9 instead of digging deeper.
2. **Check feasibility with the Tide MCP before writing code** (§5). If the MCP says a part of the design is not possible today, change the design, not the platform.
3. **Follow Tide's playbooks step by step** and check each step works before moving on. Do not jump straight to code.
4. **Never modify Tide-provided files** (for example the sign-in helper / silent-check page). Copy them exactly as the playbook gives them. "Improving" them breaks sign-in.
5. **All data is synthetic.** No real people, real exams or real emails, except the one licence email the human gives you.
6. **Do not invent capabilities.** If you are unsure whether TideCloak supports something, ask the Tide MCP. Tell the human plainly what is built in, what is custom app logic, and what is mocked.
7. **Security checks belong on the server.** Hiding a button is not security. Every API route checks the caller's role from a verified token.
8. **Some steps only a human can do.** Ask the human, and wait, for: the licence email, accepting Tide's terms, browser sign-ins, approving in the Tide popup, creating accounts, and pushing to GitHub. You cannot drive a Tide browser login yourself.

---

## 1. Hackathon context

- **Event:** RMIT hackathon, **Challenge 2: "UNLOCKED"**, set by Tide. Brief: https://tide.org/unlocked/
- **Question:** *"What would you build if trust stopped being the bottleneck?"*
- **Task:** build a **small working prototype with TideCloak integrated** that shows **one** compelling new possibility, where **no single administrator, organisation or AI can unilaterally override** the rules protecting people's data and decisions. Explain why removing unilateral control makes it possible.
- **Key rule from the brief:** *"If your app would work exactly the same with ordinary login and backend permissions, develop the idea further. TideCloak should change what it can credibly do."*
- **Avoid:** a project that is mainly a login demo, a security tool, or a generic access-control dashboard.
- **A finished product is not expected.** One convincing demonstration is.

### Deliverables (both in one public GitHub repo, link submitted via Google Form)
1. **Public GitHub repository** containing the prototype code with TideCloak integrated, and a **README that starts with a "Project overview" of 300 words or fewer**, using the template in §11. Setup instructions go in a separate section.
2. **A two-minute demo video**, `.mp4`, **under 100 MB**, committed into the repo.

### Judging (judges read the README overview alongside the video)
| Weight | Criterion | README prompt |
|---|---|---|
| 25% | Vision & originality | What new product, service, experience or way of working are you proposing? What makes it distinctive? |
| 20% | Trust constraint insight | What is difficult, risky or impossible today because trust, privacy or security gets in the way? What becomes possible when that constraint is removed? |
| 20% | Value & impact | Who benefits, and how? Give a concrete example. |
| 20% | Why TideCloak matters | How does the app use TideCloak, and how does that integration enable the idea? |
| 15% | Prototype & storytelling | What does the prototype demonstrate today? What key interaction should judges look for? |

---

## 2. The product: SealedExam

**One line:** SealedExam delivers national exam papers to exam sites early, encrypted, so that nobody, not even the ministry, the IT operator or the platform, can open a paper alone before the exam starts. Opening requires approval from a council.

**Pitch line:** *"Nobody can leak the exam alone, because nobody holds the key alone."*

### Framing (important: get this right in README and video)
- **Do NOT claim that exam leaks are frequent today.** Recent years show no confirmed pre-exam paper leaks in Vietnam's national exam. The most recent recorded incident (2025) was **in-room cheating**: candidates photographed questions during the exam and sent them out. SealedExam does **not** solve in-room cheating.
- **The real trust constraint** is that national exam security works only because of a **long, expensive chain of trusted people and physical custody**: quarantined setters and printers, police escorts, sealed envelopes. Going digital today would just move the master key to a database admin or a cloud vendor, which is why digital or computer-based national exams are hard to trust.
- **The new possibility** is that papers can travel digitally and early, and the authority to open them only emerges at exam time when independent parties approve. No single person ever holds it.
- **Example context:** Vietnam's national high-school graduation exam (around one million candidates a year). Frame it for international judges as **"high-stakes national exams"**, which every country runs.
- **State the limits honestly** (judges reward this): once a paper is opened at the bell, in-room controls still apply. Collusion by a full quorum is still possible, but every approval is attributable in the audit trail.

---

## 3. Tide / TideCloak primer (what we know)

- **TideCloak** is an identity and access server (Keycloak-based) that provides user sign-in, roles, permissions and data protection. It runs locally at `localhost:8080` (Docker), or is hosted by Tide.
- **Tide network:** independent nodes ("ORKs") that jointly hold key authority. Decryption works only when enough nodes agree that the caller's session carries the required role. In Tide's walkthrough an unauthorised attempt failed with *"Got 0 out of 14 required."*
- **Emergent Authority:** there is no master key. Authority for a protected action emerges only when identity, policy and approvals align.
- **Tide SDK (browser):** encrypts and decrypts in the user's browser, so the app server stores **ciphertext only**. Calls to your own server must go through the SDK's **secure fetch**; plain `fetch` gets a 401.
- **Approvals:** sensitive realm changes (for example assigning roles) become **change requests** that must be signed by admins in a Tide **approval popup ("enclave")** before they take effect. An operator or hacker cannot silently grant access. The Tide MCP references an **"IGA change-request API"**, an **"admin approval"** prompt and a **"governance panel"** scenario. Use these.
- **Tide MCP:** read-only guidance (playbooks, scenarios, security canon, analysis tools). It does not build things or touch accounts. It only tells you how.

### Known gotchas (from Tide's official walkthrough)
| Gotcha | What to do |
|---|---|
| MCP tools not visible | Start a new agent session after adding the MCP. |
| Pop-ups blocked → sign-in or approval stalls with no error | Tell the human to allow pop-ups for the app and for TideCloak. |
| VS Code's built-in browser breaks TideCloak's hidden secure-enclave frame | Use Chrome or Edge, not the VS Code browser. |
| No headless or CLI sign-in | Every identity signs in in a real browser. A bot cannot have its own Tide login. |
| Tokens are signed with **EdDSA** | Some JWT libraries (e.g. Node `jsonwebtoken`) cannot verify them. Use a library and method the Tide playbook recommends. |
| New Tide accounts have no name or email | Add a short "display name" form after first sign-in. Never make up placeholder emails. |
| Users cannot self-register by default | The human must enable **User registration** in the TideCloak admin console (realm settings). This is itself a change request needing approval. |
| Role or entitlement changes apply only after the session refreshes | Sign out and in again (or refresh the token) before demonstrating a new or removed role. |
| Realm creation needs a **real licence email** and **acceptance of Tide's T&C** | Ask the human. Do not accept on their behalf. |
| Local vs hosted is chosen at realm creation and cannot be moved later | Default: **local** (Docker). The human must start Docker Desktop first. |
| Custom programmable policies ("Forseti contracts") are experimental and only Tide can deploy them | **Do not depend on them.** Use only built-in features: encryption, roles, change-request approvals. |
| Stale session or cache issues | Clear site storage for localhost (DevTools → Application → Storage → Clear) and sign in again. |

### Machine state (checked)
Windows 10 Home. Node v24.14.1, npm 9.6.6, Git 2.36.1, Claude Code 2.1.307. **Docker 29.5.3 is installed but was not running.** Ask the human to start Docker Desktop (WSL2) before deploying TideCloak locally.

---

## 4. Connect the Tide MCP (if not already connected)

Either:
- Remote: `claude mcp add --transport http tide https://mcp.tide.org/mcp`
- Local package (per docs.tide.org/ai-agent-pack): `claude mcp add tide-pack -- npx -y @tideorg/mcp`

Then **start a new session** and confirm the Tide tools are listed (`/mcp`).

---

## 5. Phase 0: feasibility check (do this before writing any code)

Ask the Tide MCP (use its playbook and scenario routing tools; read the "admin approval" prompt, the "governance panel" scenario and the IGA change-request canon):

1. Which playbook or Quickstart stack should a new web app use (framework, SDK packages)? Use that stack.
2. **E2EE by role:** can content be encrypted in the browser so that only users holding a specific role (e.g. `exam-releaser`) can decrypt it? Can **encrypt** and **decrypt** permissions be given to different roles (setters may encrypt but not decrypt)? **VERIFY**
3. **Multi-approver quorum (critical):** can assigning a role to a user require approval from **2 of 3** designated approvers (realm admins)? How is the threshold set? Can one admin create a change request but not commit it alone? **VERIFY**
4. Can the app list and sign pending change requests in-app (IGA change-request API), or must approvals happen in the TideCloak admin console?
5. What audit information about change requests and approvals can the app read (who approved, when)?

**Decision:**
- **Plan A (preferred):** quorum of 2 of 3 approvers is supported. Use it.
- **Plan B (fallback):** if only "admin changes need approval" without a configurable threshold, use whatever multi-admin approval rule TideCloak enforces by default. Describe it accurately in the README (e.g. "role grants require council sign-off; no admin can grant alone"). **Never claim "2 of 3" unless it is actually configured and demonstrated.**

Report the findings to the human in 5 to 10 lines before building.

---

## 6. System design

### 6.1 Architecture
```
[Browser: one Chrome profile per persona]
   │  Tide SDK: sign-in, encrypt/decrypt in browser, secure fetch, approval popup
   ▼
[SealedExam web app  — localhost:3000]  (stack per Tide playbook)
   │  API routes: verify EdDSA token + role on EVERY request
   │  App storage: SQLite or JSON file — ciphertext, metadata, audit log ONLY
   ▼
[TideCloak — localhost:8080 (Docker)]  realm "sealedexam": users, roles, change requests
   ▼
[Tide network (ORK nodes, internet)]  holds key authority; releases decryption only to the right role
```
The app server **never** sees plaintext exam content and never holds a decryption key.

### 6.2 Roles (realm roles in TideCloak)
| Role | Can | Cannot |
|---|---|---|
| `exam-setter` | Sign in; submit questions (encrypted in browser) | Decrypt any question, including their own after sealing |
| `council` (realm admin / approver) | View pending role requests; sign approvals in the Tide popup | Grant a role alone; decrypt papers (unless also granted `exam-releaser` via quorum) |
| `exam-releaser` | Decrypt the exam paper in the browser | Obtain this role without quorum approval |
| `proctor` | Sign in; press "Request release" after the bell; view the decrypted paper once granted `exam-releaser` | Open the paper before approval |
| *(operator view)* | Any signed-in council member or admin can open the "Operator view" page showing raw stored data | Read it: everything is ciphertext |

Exact role names and how they map to TideCloak's admin or approver mechanism: **VERIFY in Phase 0** and adapt.

### 6.3 Personas (demo accounts; one Chrome profile each)
| Persona | Role(s) | Used for |
|---|---|---|
| **Linh** (question setter, Ministry exam board) | `exam-setter` | Seals questions |
| **Minh** (Ministry representative) | `council` | Plays the "rogue official" who tries to self-grant release; later approves legitimately |
| **Hoa** (Provincial exam council chair) | `council` | Second approver |
| **Tuấn** (Exam site head) | `council` | Third approver (optional if only 2 approvers are needed for the demo) |
| **Nam** (Proctor, Site A Room 12) | `proctor` | Requests release at the bell, decrypts the paper |

Minimum for the demo: **Linh, Minh, Hoa, Nam** (4 browser profiles). Names are fictional. The human creates each account in the browser; ask for help when you reach that step.

### 6.4 Data model (app storage; synthetic)
- **QuestionItem:** id, subject, authorPersonaId, ciphertext, createdAt, status (`sealed`).
- **ExamPaper:** id, title (e.g. "Mathematics — National Graduation Exam 2026 (synthetic)"), questionItemIds, status (`sealed` → `released`), bellTime (mocked).
- **ExamSite:** id, name (e.g. "Hanoi Council — Site A — Room 12"), proctorPersonaId.
- **ReleaseRequest:** id, examPaperId, siteId, requesterId, createdAt, linked TideCloak change-request id, status (`pending` / `approved` / `rejected`), approvals list (who, when) as read from TideCloak if possible.
- **AuditEvent:** timestamp, actor, action (`sealed`, `operator_viewed`, `self_grant_attempt_blocked`, `release_requested`, `approval_signed`, `paper_decrypted`, `decrypt_denied`), details.

Seed data: one paper of **10 synthetic multiple-choice maths questions** (write them yourself, simple and clearly fake), split as 5 from Linh and 5 pre-seeded. One exam site.

### 6.5 Screens
1. **Home / sign-in:** Tide sign-in with SealedExam branding. After first sign-in, a display-name form.
2. **Setter: "Seal questions":** form for a question (text + 4 options + answer). On submit, encrypt in the browser and send ciphertext. Show "Sealed. Not even you can reopen it."
3. **Operator view:** table of exactly what the server stores (ciphertext blobs, metadata). Banner: "This is everything the platform holds. It can copy or leak all of it — it still opens nothing."
4. **Exam room (Proctor):** paper card showing "Sealed". Mock **"Ring the exam bell"** button (sets bell time to now; pure app logic, say so in the UI). After the bell, **"Request release"** creates the release request and the TideCloak role-grant change request for `exam-releaser`. After approval and a token refresh, **"Open paper"** decrypts and renders the 10 questions.
5. **Council approvals:** list of pending release requests and change requests, each with an "Approve (sign with Tide)" button opening the Tide approval popup. Shows approvals collected vs required (e.g. "1 of 2"). If in-app approval is not possible, link to the TideCloak admin console approvals page and show it on camera instead.
6. **Attack panel** (visible to Minh): **"Grant myself release rights"** creates a change request granting `exam-releaser` to himself and shows that it is **pending, not effective**. Then **"Try to decrypt now"** shows the Tide network refusing. Log both to the audit trail.
7. **Audit trail:** chronological list of AuditEvents with who and when.

### 6.6 Core flows and acceptance criteria
| # | Flow | Pass when |
|---|---|---|
| F1 | Sign-in per persona | Each of the 4 personas signs in with Tide in its own Chrome profile; roles show correctly. |
| F2 | Seal | Linh submits a question; server storage contains only ciphertext (verify by inspecting the DB or file). |
| F3 | Operator view | Shows ciphertext only; no plaintext anywhere in server logs or DB. |
| F4 | Unauthorised decrypt | A user without `exam-releaser` tries to decrypt → refused by the Tide network (not merely by a UI check). Error shown and audited. |
| F5 | Self-grant blocked | Minh tries to grant himself `exam-releaser` → change request stays pending; decrypt still refused. |
| F6 | Bell + request | The proctor cannot request release before the bell (app-level rule, labelled as such); after the bell a request is created. |
| F7 | Quorum release | Required approvers sign in the Tide popup → after a token refresh Nam decrypts and sees the 10 questions. |
| F8 | Audit | Every step above appears in the audit trail with actor and time. |
| F9 | Server checks | Calling an API route without the required role (e.g. with another persona's token) returns 401/403. |

### 6.7 What is built-in vs custom vs mocked (state this in the README)
- **Built-in (TideCloak and Tide):** sign-in, roles, browser E2EE with role-based decryption, change requests and approvals, Tide network enforcement.
- **Custom app logic:** exam bell timing, release-request workflow UI, audit trail, operator view.
- **Mocked:** exam bell (button), distribution to exam sites, the exam bodies and all people and questions.

---

## 7. Optional bonus (only if F1–F9 pass before 15:00)

**Per-room leak tracing**, inspired by Tide's CreatorVault walkthrough: each exam room receives the paper with a slightly different invisible mark pattern (e.g. per-room variants of question order or invisible text marks). If a photo of the paper leaks **during** the exam, the pattern identifies the room. This answers the "in-room cheating" question (§2). It is **custom app logic, not a TideCloak feature**. Say so. Skip it if time is tight.

---

## 8. Build order (time-boxed)

| Time (ICT) | Step | Checkpoint |
|---|---|---|
| 12:00–12:30 | Phase 0 feasibility (§5), report to human | Plan A or B chosen |
| 12:30–13:15 | Scaffold app per playbook; deploy TideCloak locally; create realm (human: licence email, T&C, browser link) | Sign-in works for one persona (F1) |
| 13:15–14:00 | Roles, personas, registration enabled (human approves); display-name form | F1 for all personas |
| 14:00–14:45 | Seal and operator view, E2EE by role | F2, F3, F4 |
| 14:45–15:30 | Self-grant attempt, bell, release request, approvals, decrypt | F5, F6, F7 |
| 15:30–15:45 | Audit trail, server-side checks | F8, F9 |
| 15:45–16:15 | README (§11), setup section, cleanup, `.gitignore` | README done |
| 16:15–17:00 | Human records the 2-minute video (§10); compress to < 100 MB | `.mp4` in repo |
| 17:00–17:30 | Human pushes to a **public** GitHub repo, checks it in an incognito window, submits the form | Submitted |

## 9. Fallbacks
- **Quorum or approvals not working by 14:45:** demo F2–F5 (encryption plus "self-grant is pending, not effective") and show approvals in the TideCloak admin console. Ask Tide Discord #support (https://discord.gg/XBMd9ny2q5) with the exact error.
- **Docker or local TideCloak fails:** ask the human whether to use Tide-hosted TideCloak (decided at realm creation, cannot move later).
- **Time pressure:** drop Tuấn (third approver), the bonus, and polish. Never drop F4/F5/F7. They are the whole story.

---

## 10. Demo video script (2 minutes, record in English)

| Time | Section | Show / say |
|---|---|---|
| 0:00–0:20 | The possibility | "What if a national exam could be delivered digitally, days early, yet nobody could open it before the bell?" |
| 0:20–0:40 | The constraint | Today: quarantined setters, police escorts, sealed envelopes. A chain of trusted people. Going digital just hands the key to an admin or vendor. |
| 0:40–1:00 | Prototype 1 | Linh seals questions → Operator view shows only ciphertext. |
| 1:00–1:20 | Prototype 2 | Minh grants himself release rights → pending, not effective; decrypt refused by the Tide network. |
| 1:20–1:45 | Prototype 3 | Bell → Nam requests release → Minh and Hoa sign in the Tide popup → Nam opens the paper. Audit trail shows who approved. |
| 1:45–2:00 | What changes | "Nobody can leak the exam alone, because nobody holds the key alone." |

---

## 11. README template (put at the very top of README.md; overview ≤ 300 words)

Adjust sections 4 and 5 to what actually works. **Do not claim anything not demonstrated** (e.g. say "2 of 3" only if it is real). Count the words.

```markdown
[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

SealedExam delivers national exam papers to exam sites early, encrypted, so that nobody — not even the ministry or the platform — can open one alone before the bell.

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality
<!-- A digital chain of custody for high-stakes exams where authority to open a paper only emerges at exam time, from independent approvers. -->

### 2. Trust constraint insight
<!-- Exam security today relies on a long, costly chain of trusted people and physical custody. Digitising it just moves the master key to an admin or vendor, so digital national exams stay hard to trust. Remove the master key and papers can travel digitally, early. -->

### 3. Value & impact
<!-- ~1 million candidates sit Vietnam's national graduation exam each year. Lower custody cost, honest staff protected from suspicion, a credible path to computer-based exams. Limitation: in-room cheating still needs room controls. -->

### 4. Why TideCloak matters
<!-- Browser E2EE: the server stores only ciphertext. Only the exam-releaser role can decrypt, enforced by the Tide network. Granting that role is a change request that council approvers must sign; no admin can grant it alone. With ordinary login, whoever controls the database could open the paper. -->

### 5. Prototype & storytelling
<!-- Three moments: operator sees only ciphertext; an official's self-grant stays pending and decryption is refused; at the bell, approvers sign and the proctor opens the paper, with the audit trail. -->

## Setup
<!-- Prerequisites (Docker Desktop, Node), how to start TideCloak and the app, how to create personas, demo steps. Note built-in vs custom vs mocked (§6.7). -->
```

---

## 12. Submission checklist
- [ ] Repo is **public**; opens in an incognito window
- [ ] README starts with Project overview (≤ 300 words, all 5 sections); Setup is separate
- [ ] `.mp4` ≤ 2 minutes, < 100 MB, committed in the repo
- [ ] All data synthetic; no secrets or real emails committed (check `.env`, TideCloak exports, licence keys)
- [ ] Form submitted: https://forms.gle/HRHYjnqB86j1LFS97 before **18:00 ICT** (aim 17:30)

## 13. Do NOT
- Do not depend on Forseti contracts or time-lock features.
- Do not modify Tide's provided files.
- Do not verify tokens with a library that cannot handle EdDSA.
- Do not use plain `fetch` for calls that need the Tide session.
- Do not store plaintext questions on the server, in logs, or in seed files committed to the repo (seed questions are encrypted at first run in a browser, or clearly labelled synthetic sample text that is not the "sealed" copy).
- Do not claim recent real-world exam leaks, or "2 of 3" quorum, unless verified.
- Do not build extra features (grading, printing, many sites) before F1–F9 pass.

## 14. Questions to ask the human when you reach them
1. Licence email for the Tide realm (must be a real address they control).
2. Do they accept Tide's terms and conditions?
3. Is Docker Desktop running? Local or hosted TideCloak?
4. Each browser sign-in or account creation and each approval popup (they must click).
5. GitHub repo name and who pushes.

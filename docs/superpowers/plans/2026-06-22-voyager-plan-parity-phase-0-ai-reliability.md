# Phase 0 — AI Reliability Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Voyager's AI features work end-to-end by confirming the `ai-proxy` edge function on the **live** Supabase project (`wnpanbjzmcsvhfyjdczv`) is the real Claude proxy (not the mis-deployed trip-invite emailer), that `ANTHROPIC_API_KEY` is set, and that the founder/credits gate behaves correctly — then prove it with a full smoke-test matrix and leave behind a recoverable operator runbook in `handoff.md`.

**Architecture:** This is a **platform/infrastructure gate**, not an app feature. Standing theory (`handoff.md` → "Backend / AI status"): the `ai-proxy` slug has the trip-invite **emailer** (Resend) deployed instead of the Claude proxy, so AI requests `403` (an AI request `{messages,…}` has no `trip_id`, the emailer's trip lookup fails). The correct proxy is already committed at `supabase/functions/ai-proxy/index.ts` and the client (`app/src/trip/ai.ts → callAI`) is already correct. **No app/client code changes happen in Phase 0** — `ai.ts` is already correct and must NOT be touched. The work is: probe → (deploy if wrong) → set/verify secret → verify founder role → run the smoke matrix → document. The gate logic enforced server-side: `profiles.role === 'founder'` = unlimited; `credits > 0` = 1 credit/call; otherwise `403`.

**Tech Stack:** Supabase Edge Functions (Deno), supabase CLI (via `npx supabase`), `npx wrangler` (only relevant for the live app under test), vitest. Live Supabase project ref: **`wnpanbjzmcsvhfyjdczv`** (the older `gvhtvarqgzjhbjzupdlv` is STALE — never deploy against it). Live app: https://voyager.edwardvth.workers.dev

---

## Pre-flight (operator context)

- [ ] Confirm you have **operator/owner access** to the Supabase project `wnpanbjzmcsvhfyjdczv` (Dashboard login at https://supabase.com/dashboard and a CLI session). Several steps require browser-based OAuth.
- [ ] Confirm you have a **current, valid Anthropic API key** ready to set as the secret (the previous key was rotated per `handoff.md` → Security status). You do NOT need to know the old key.
- [ ] Confirm the working directory is the repo root `C:\Users\edwar\travel` and `supabase/functions/ai-proxy/index.ts` exists (it's the correct proxy — calls `api.anthropic.com`).
- [ ] Note: this plan changes **no app code**. The only file edited/committed at the end is `handoff.md`.

---

## Task 1 — Confirm the deployed `ai-proxy` slug's actual code

**Intent:** Distinguish, with an exact signal, whether the live `ai-proxy` slug is the **Resend emailer** (wrong) or the **Anthropic proxy** (correct). This decides whether Task 2 runs.

- [ ] Authenticate the CLI if not already: run `npx supabase login` (opens a browser; paste the access token it shows back into the terminal). Expected: `You are now logged in.`
- [ ] List the project's edge functions:
  ```bash
  npx supabase functions list --project-ref wnpanbjzmcsvhfyjdczv
  ```
  Expected output: a table with a NAME/SLUG column. Confirm a row named **`ai-proxy`** exists (it should — the slug exists; the question is *which code* is under it). Also note whether a **`send-invite`** row exists; per `handoff.md` it currently 404s / does not exist, which is itself evidence the invite code is living under `ai-proxy`.
- [ ] Inspect the deployed source in the Dashboard: open **https://supabase.com/dashboard/project/wnpanbjzmcsvhfyjdczv/functions** → click **`ai-proxy`** → **Code** tab.
- [ ] Read the deployed code and classify it using this exact signal:
  - **EMAILER (WRONG):** references Resend (`resend`, `RESEND_API_KEY`, `api.resend.com`, `emails.send`, an `invite`/`trip_id`/membership lookup) and contains **no** `https://api.anthropic.com` call. → Task 2 is REQUIRED.
  - **CORRECT PROXY:** contains `fetch('https://api.anthropic.com/v1/messages'`, reads `ANTHROPIC_API_KEY`, and gates on `profiles` `role`/`credits` (matches `supabase/functions/ai-proxy/index.ts` in the repo). → SKIP Task 2; go straight to Task 3.
- [ ] (Optional corroborating probe) From a terminal, send a minimal AI-shaped request and read the response — a `403` with body `{"error":"no_ai_access",...}` indicates the **correct proxy** rejecting on the gate (founder/credits), whereas a `403` `forbidden`/membership-style error or a Resend-shaped error indicates the **emailer**. Substitute the anon key (visible in Dashboard → Settings → API):
  ```bash
  curl -i -X POST \
    https://wnpanbjzmcsvhfyjdczv.supabase.co/functions/v1/ai-proxy \
    -H "Content-Type: application/json" \
    -H "apikey: <ANON_KEY>" \
    -H "Authorization: Bearer <ANON_KEY>" \
    -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":16}'
  ```
  - **Correct proxy, unauthenticated:** `401 unauthorized` (it requires a signed-in user before the gate). This already proves it's the proxy, not the emailer.
  - **Emailer:** typically `403`/`400` with an invite/`trip_id`/Resend-shaped body, and no Anthropic involvement.
- [ ] **Record the verdict** (emailer vs. proxy) in your working notes — it becomes the "confirmed finding" written into `handoff.md` in Task 6.

---

## Task 2 — Deploy the real Claude proxy (only if Task 1 found the emailer)

**Intent:** Replace the wrong code under the `ai-proxy` slug with the committed correct proxy.

- [ ] Ensure CLI auth from Task 1 is still valid (re-run `npx supabase login` if it expired).
- [ ] From the repo root, deploy the committed proxy to the live project:
  ```bash
  npx supabase functions deploy ai-proxy --project-ref wnpanbjzmcsvhfyjdczv
  ```
  Expected output: `Deploying Function: ai-proxy` … `Deployed Function ai-proxy on project wnpanbjzmcsvhfyjdczv` and a Dashboard URL. (Browser auth may be prompted again.)
- [ ] **Alternative if the CLI deploy fails or CLI auth is unavailable** — paste-deploy via Dashboard:
  1. Open `supabase/functions/ai-proxy/index.ts` in the repo and copy its full contents.
  2. Dashboard → **Edge Functions** → **`ai-proxy`** → **Code** → replace the editor contents with the repo file → **Deploy**.
- [ ] Re-verify in Dashboard → Edge Functions → `ai-proxy` → **Code** that the deployed code now contains `fetch('https://api.anthropic.com/v1/messages'` and the `role`/`credits` gate. Expected: it matches the repo file.
- [ ] Re-run the unauthenticated probe from Task 1; expected now: **`401 unauthorized`** (proves the proxy is live and enforcing the signed-in-user check).

---

## Task 3 — Set / verify the `ANTHROPIC_API_KEY` secret

**Intent:** The proxy returns `500 "AI is not configured (missing ANTHROPIC_API_KEY)"` if the key is unset. Ensure a current valid key is present.

- [ ] List existing secrets:
  ```bash
  npx supabase secrets list --project-ref wnpanbjzmcsvhfyjdczv
  ```
  Expected: a table including `ANTHROPIC_API_KEY` with a non-empty DIGEST/value hash. (Secret values are never shown — only names + digests.) If `ANTHROPIC_API_KEY` is absent, set it (next step).
- [ ] Set (or rotate to a current) key:
  ```bash
  npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref wnpanbjzmcsvhfyjdczv
  ```
  Expected output: `Finished supabase secrets set.` (Use the real current key — no placeholder. Setting an existing secret name overwrites it, which is how you rotate.)
  - **Dashboard alternative:** Edge Functions → **Secrets** (or Project Settings → Edge Functions → Secrets) → add/edit `ANTHROPIC_API_KEY` → Save.
- [ ] Re-run `npx supabase secrets list --project-ref wnpanbjzmcsvhfyjdczv` and confirm `ANTHROPIC_API_KEY` now appears with a digest. Expected: present.
- [ ] Note: secret changes take effect on the next function invocation (no redeploy needed). If you just deployed in Task 2 AFTER setting the secret, no extra action; if you set the secret AFTER deploy, it's still picked up live.

---

## Task 4 — Verify the owner's `profiles.role = 'founder'`

**Intent:** The owner account must hit the unlimited branch of the gate so the smoke matrix's "founder = unlimited" row passes. This project's `profiles` are separate from the legacy site's.

- [ ] Dashboard → **Table Editor** → schema `public` → table **`profiles`**.
- [ ] Find the owner's row (match `id` to the owner's auth user — cross-reference Dashboard → **Authentication → Users** by the owner's email if needed).
- [ ] Confirm `role = 'founder'`. Expected: the cell reads `founder`.
- [ ] If it is NOT `founder`: set it. **Privilege lock note (`handoff.md` → Security):** `update (role, credits) on profiles` is REVOKED from `anon`/`authenticated`, so the role canNOT be changed from the client or via a normal user session — by design (the AI gate is tamper-proof). Change it as the **operator**, either:
  - Table Editor (Dashboard runs as the privileged service role) → edit the `role` cell → `founder` → Save, OR
  - Dashboard → **SQL Editor** → run (substitute the real id or email):
    ```sql
    update public.profiles
       set role = 'founder'
     where id = (select id from auth.users where email = '<owner-email>');
    ```
    Expected: `UPDATE 1`.
- [ ] (Optional, for the gate-holds smoke row) Confirm there is a way to exercise a **non-founder, zero-credits** account: either a test account with `role` not `'founder'` and `credits = 0`, or note that you'll temporarily verify by checking the gate via the probe. Do NOT demote the owner.

---

## Task 5 — Smoke-test matrix (the EXIT GATE)

**Intent:** Don't declare "AI works" off one endpoint. Run every row in the live app at https://voyager.edwardvth.workers.dev signed in as the **founder** owner, plus the gate-holds negative case. ALL rows must pass to exit Phase 0.

**How to reach each trigger in the running app** (per `CLAUDE.md`/`handoff.md` — the planner is `/trip/:id`, three tabs Plan · Guide · Trip):

| # | Check | How to trigger (screen / button) | Expected result |
|---|---|---|---|
| 1 | **Suggest Places** | Open a trip → **Plan** tab → **Add stop** (`AddStop`) → use the **AI place suggest** action (`suggest.ts:suggestPlaces`) | Returns a list of suggested places — **no `403`/`429`**, no "AI request failed" toast |
| 2 | **Suggest Day** | **Plan** tab → the "suggest a whole day" / AI day action (`suggest.ts:suggestDay`) | Returns a full day itinerary of stops — no `403`/`429` |
| 3 | **Enrich Stop** | Open a stop → **Stop detail** (`StopDetail`, route `/trip/:id/stop/:day/:n`) → trigger enrichment (`enrich.ts`); or open the stop in **Guide** Story/Facts tabs | Returns Story / Interesting Facts content — no `403`/`429` |
| 4 | **Non-founder, zero credits** | Sign in as (or simulate) an account with `role ≠ 'founder'` and `credits = 0`; attempt any AI action above | **`403`** — gate holds; client shows an AI-unavailable/limit message. This MUST fail-closed |
| 5 | **Founder account** | As the owner (`role = 'founder'`), run checks 1–3 several times in a row | **Unlimited** — no `403` and no `429` even on repeated calls (founders are not credit-limited) |

- [ ] **Row 1 — Suggest Places:** pass (places returned).
- [ ] **Row 2 — Suggest Day:** pass (itinerary returned).
- [ ] **Row 3 — Enrich Stop:** pass (story/facts returned).
- [ ] **Row 4 — Non-founder zero-credits → `403`:** pass (gate holds; request is rejected). If you cannot create a separate account, verify via the probe by calling with a non-founder session token and confirming the `403 {"error":"no_ai_access"}` body; restore any test state afterward.
- [ ] **Row 5 — Founder unlimited:** pass (repeated calls, no `403`/`429`).
- [ ] If any row fails: triage by symptom — `401` → the request isn't authenticated (signed-out / token issue, app-side, out of Phase 0 scope but note it); `403 no_ai_access` for the founder → re-check Task 4 (`role`); `500 missing ANTHROPIC_API_KEY` → re-check Task 3; `403`/Resend-shaped error for everyone → the emailer is still deployed, return to Task 2; `429` for the founder → unexpected, capture the response body and the Edge Function logs (Dashboard → Edge Functions → `ai-proxy` → **Logs**).
- [ ] **EXIT CRITERION:** all five rows above are checked. Only then is the platform gate satisfied and the dependent tiers (1/2/3) unblocked.

---

## Task 6 — Update `handoff.md` and commit

**Intent:** Replace the *theory* with the *confirmed finding + resolution applied*, and add a short, self-contained operator runbook so AI is recoverable without re-diagnosing from scratch.

- [ ] Edit `C:\Users\edwar\travel\handoff.md` → the **"Backend / AI status"** section:
  - Replace the "⚠️ AI needs the ai-proxy slug fixed (pending operator)" framing and the "Root cause … (to confirm)" theory with the **confirmed finding** from Task 1 — state plainly which code was actually deployed under `ai-proxy` (emailer vs. proxy) and what was done about it (e.g. "Confirmed the emailer was deployed; redeployed the committed Claude proxy on `wnpanbjzmcsvhfyjdczv`" OR "Confirmed the correct proxy was already deployed; only the secret/role needed verifying").
  - Record the **resolution applied**: proxy deploy status, `ANTHROPIC_API_KEY` set/verified, owner `profiles.role = 'founder'` confirmed, and that the **smoke matrix passed** (note the date).
  - Update the status marker from "⚠️ pending operator" to a resolved/✅ state.
- [ ] Add a short **"AI / ai-proxy operator runbook"** subsection to `handoff.md` (so this is recoverable). It should list, concisely:
  1. Where the source of truth lives: `supabase/functions/ai-proxy/index.ts` (repo), live project ref `wnpanbjzmcsvhfyjdczv`, client caller `app/src/trip/ai.ts`.
  2. Redeploy: `npx supabase login` then `npx supabase functions deploy ai-proxy --project-ref wnpanbjzmcsvhfyjdczv` (or Dashboard paste).
  3. Secret: `npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref wnpanbjzmcsvhfyjdczv`; verify with `npx supabase secrets list --project-ref wnpanbjzmcsvhfyjdczv`.
  4. Founder gate: ensure owner `profiles.role = 'founder'` in Table Editor (privilege-locked from clients; operator-only).
  5. Verify: the 5-row smoke matrix (Suggest Places / Suggest Day / Enrich Stop / non-founder→403 / founder→unlimited).
  6. Gotcha: never use the stale `gvhtvarqgzjhbjzupdlv` ref.
- [ ] Keep `CLAUDE.md`'s short backend note coherent — only edit it if it still asserts the deploy is pending; otherwise leave it.
- [ ] Commit ONLY `handoff.md` (and `CLAUDE.md` if touched) — do NOT commit any app/edge-function code from Phase 0 (none changed). On `main` (push to `origin/main` only — never `upstream`):
  ```bash
  git add handoff.md
  git commit -m "$(cat <<'EOF'
  docs(handoff): record confirmed ai-proxy finding + AI operator runbook (Phase 0)

  Replace the ai-proxy 403 theory with the confirmed finding and the resolution
  applied (deploy/secret/founder-role); add a recoverable operator runbook and
  the smoke-test matrix as the exit gate. No app/edge-function code changed.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```
  Expected: one commit touching only `handoff.md`. Push when the owner asks (per repo convention, push at checkpoints).

---

## Definition of done

- [ ] **Task 1:** the deployed `ai-proxy` code is classified with the exact signal (emailer vs. Anthropic proxy) and the verdict recorded.
- [ ] **Task 2 (conditional):** if it was the emailer, the committed Claude proxy is deployed and re-verified to call `api.anthropic.com` (unauthenticated probe → `401`).
- [ ] **Task 3:** `ANTHROPIC_API_KEY` is set on `wnpanbjzmcsvhfyjdczv` and appears in `secrets list`.
- [ ] **Task 4:** the owner's `profiles.role = 'founder'` is confirmed (or set as operator).
- [ ] **Task 5 (EXIT GATE):** all five smoke-matrix rows pass — Suggest Places, Suggest Day, Enrich Stop, non-founder zero-credits → `403`, founder → unlimited (no `403`/`429`).
- [ ] **Task 6:** `handoff.md` updated (theory → confirmed finding + resolution) with an operator runbook; committed with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- [ ] **No app/client code changed** — `app/src/trip/ai.ts` is untouched (it was already correct).
- [ ] Phase 0 platform gate satisfied → Tiers 1/2/3 of the Plan-parity initiative are unblocked.

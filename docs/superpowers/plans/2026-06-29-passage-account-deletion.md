# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user permanently delete their account from inside the app — deleting travels they solely own, transferring shared owned travels to the earliest-joined real member (Zoom-style), removing them from travels they only joined — required by Apple Guideline 5.1.1(v).

**Architecture:** A transactional Postgres RPC `delete_account_data(p_uid, p_email)` does all DB work atomically + idempotently; a service-role Edge Function `delete-account` authenticates the caller from the JWT, calls the RPC, runs an Apple-revoke hook (no-op while SIWA off), then `auth.admin.deleteUser` last; a client `requestAccountDeletion()` helper + a type-"DELETE" `DangerConfirm` dialog wired into Account settings.

**Tech Stack:** Supabase (Postgres RPC + Deno Edge Function, project ref `wnpanbjzmcsvhfyjdczv`), React 18 + TS + Tailwind, vitest. Spec: `docs/superpowers/specs/2026-06-29-passage-account-deletion-design.md`.

**Conventions:** Commit per task with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. Keep the vitest suite green (currently **783**) and `npx tsc -b` clean. Run all `npm`/`npx` from `app/`. Legend: 🪟 code (Windows) · ⚙️ owner/manual (Supabase dashboard or CLI).

---

## File Structure

- **Create** `docs/supabase/2026-06-29-delete-account.sql` — the `delete_account_data` RPC migration (run in the Supabase SQL editor).
- **Create** `supabase/functions/delete-account/index.ts` — the orchestrating Edge Function.
- **Create** `app/src/auth/deleteAccount.ts` — client network helper `requestAccountDeletion()` (pure-ish, unit-tested).
- **Create** `app/src/auth/deleteAccount.test.ts` — its tests.
- **Create** `app/src/components/DangerConfirm.tsx` — type-a-word-to-confirm dialog (no existing one supports a text gate).
- **Create** `app/src/components/DangerConfirm.test.tsx` — its tests.
- **Modify** `app/src/auth/AuthProvider.tsx` — add `deleteAccount()` to context (calls the helper, tears down session on success).
- **Modify** `app/src/components/AccountSettings.tsx` — add the "Danger zone → Delete account" button + dialog.
- **Create** `docs/superpowers/notes/account-deletion-schema-audit.md` — Task 1 output.

---

## Task 1 ⚙️ Live-schema audit

The `trips`/`trip_members`/invite schema lives in the Supabase dashboard, not the repo. Confirm the real columns before writing the RPC. Spec "Schema audit" section drives this.

**Files:**
- Create: `docs/superpowers/notes/account-deletion-schema-audit.md`

- [ ] **Step 1: Run the introspection queries** in the Supabase dashboard → SQL Editor (project `wnpanbjzmcsvhfyjdczv`):

```sql
-- columns of the key tables
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('trips','trip_members','profiles')
order by table_name, ordinal_position;

-- find the invite table + its columns (name may be 'trip_invites' / 'invites' / similar)
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name ilike '%invite%'
order by table_name, ordinal_position;

-- existing account-related functions for reference
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name in
  ('delete_trip','add_trip_member','remove_trip_member','create_trip','trip_owner_emails','create_invite');

-- does any trip JSON carry per-user PII? eyeball a few rows
select id, owner_id, jsonb_object_keys(config) as config_key from trips limit 20;
select id, jsonb_object_keys(data) as data_key from trips limit 20;
```

- [ ] **Step 2: Record findings** in `docs/superpowers/notes/account-deletion-schema-audit.md`, answering exactly:
  - `trip_members` columns — has `user_id`? has `email`? has `created_at`? has `id`?
  - the **invite table name** + whether it has `created_by`/`invited_by`/`owner_email` (sender PII) and its FK to `trips`.
  - is the owner also a `trip_members` row, or only `trips.owner_id`?
  - do `trips.config`/`trips.data` contain per-user PII (name/email/author/prefs), or only neutral itinerary content?

- [ ] **Step 3: Commit the notes**

```bash
git add docs/superpowers/notes/account-deletion-schema-audit.md
git commit -m "docs: account-deletion live-schema audit"
```

> **Decision propagation:** Task 2's RPC below is written against the **most likely** schema (membership keyed by `email`, invite table `trip_invites`, neutral trip JSON). The two spots that depend on the audit are marked **AUDIT-ADJUST** — change only those if the audit differs.

---

## Task 2 🪟+⚙️ The `delete_account_data` RPC

**Files:**
- Create: `docs/supabase/2026-06-29-delete-account.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- docs/supabase/2026-06-29-delete-account.sql
-- Transactional, idempotent account-data deletion for Passage account deletion.
-- Called ONLY by the service-role `delete-account` Edge Function. Runs entirely
-- inside the function's transaction (SECURITY DEFINER). Auth-user deletion is
-- handled by the Edge Function afterwards (cannot live in a Postgres tx).
--
-- Behaviour (see 2026-06-29-passage-account-deletion-design.md):
--  • owned trip with >=1 real member  -> transfer to earliest-joined real member,
--    drop that member's now-redundant membership row, scrub sender PII from invites
--  • owned trip with no real member   -> delete it (cascade members + invites)
--  • trips the user only joined        -> delete the user's membership rows
--  • profile row                       -> delete
-- Returns a summary so the caller can log/show counts.

create or replace function public.delete_account_data(p_uid uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_new_owner uuid;
  v_deleted int := 0;
  v_transferred int := 0;
  v_left int := 0;
begin
  -- 1. Owned trips: transfer if a real collaborator exists, else delete.
  for v_trip in select id from trips where owner_id = p_uid loop
    -- earliest-joined OTHER member who has a real auth account.
    -- AUDIT-ADJUST(members): this assumes trip_members(email, created_at). If the
    -- table also has user_id, prefer m.user_id over the email->users lookup.
    select u.id into v_new_owner
    from trip_members m
    join auth.users u on lower(u.email) = lower(m.email)
    where m.trip_id = v_trip.id
      and lower(m.email) <> lower(p_email)
    order by m.created_at asc nulls last
    limit 1;

    if v_new_owner is not null then
      update trips set owner_id = v_new_owner where id = v_trip.id;
      -- drop the new owner's redundant membership row
      delete from trip_members m
      using auth.users u
      where m.trip_id = v_trip.id and lower(u.email) = lower(m.email) and u.id = v_new_owner;
      -- AUDIT-ADJUST(invites): neutralize sender PII on pending invites for this trip.
      -- If the invite table/columns differ, fix the table name + column here.
      -- If invites carry NO sender PII, delete this statement.
      update trip_invites set created_by = null
      where trip_id = v_trip.id and created_by = p_uid;
      -- AUDIT-ADJUST(json-scrub): the documented TripConfig/TripData hold only
      -- neutral itinerary content, so NO scrub by default. If the audit finds
      -- per-user PII in config/data, scrub those keys here, e.g.:
      --   update trips set config = config - 'someUserField' where id = v_trip.id;
      v_transferred := v_transferred + 1;
    else
      delete from trips where id = v_trip.id;  -- members + invites cascade via FK
      v_deleted := v_deleted + 1;
    end if;
  end loop;

  -- 2. Trips the user only joined: remove their membership rows.
  with del as (
    delete from trip_members where lower(email) = lower(p_email) returning 1
  )
  select count(*) into v_left from del;

  -- 3. Profile row (auth.users is deleted by the Edge Function afterwards).
  delete from profiles where id = p_uid;

  return jsonb_build_object('deleted', v_deleted, 'transferred', v_transferred, 'left', v_left);
end;
$$;

revoke all on function public.delete_account_data(uuid, text) from public, anon, authenticated;
```

- [ ] **Step 2: Apply it** ⚙️ — paste the file contents into the Supabase SQL Editor and run. Expected: "Success. No rows returned."

- [ ] **Step 3: Manual verification** ⚙️ — create throwaway rows and assert each branch. Run in the SQL editor (use a real test auth user id for `:uid`/`:email`, and two other real test users A and B as members):

```sql
-- CASE A owned, no members -> deleted
-- CASE B owned, member B (earliest) + C -> transferred to B
-- CASE C owned, only a non-account email invite -> deleted
-- CASE D member of someone else's trip -> membership removed, trip remains
select public.delete_account_data(:uid, :email);   -- returns {"deleted":2,"transferred":1,"left":1}
-- verify:
select id, owner_id from trips where id in (:a,:b,:c);      -- a,c gone; b.owner_id = B
select * from trip_members where lower(email) = lower(:email);  -- none
select public.delete_account_data(:uid, :email);   -- IDEMPOTENT: returns all zeros, no error
```
Expected: counts match, idempotent re-run returns `{"deleted":0,"transferred":0,"left":0}`.

- [ ] **Step 4: Commit**

```bash
git add docs/supabase/2026-06-29-delete-account.sql
git commit -m "feat(db): transactional delete_account_data RPC (transfer/delete/leave)"
```

---

## Task 3 🪟+⚙️ The `delete-account` Edge Function

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

- [ ] **Step 1: Write the function** (mirrors `ai-proxy` structure)

```ts
// supabase/functions/delete-account/index.ts
//
// In-app account deletion (Apple Guideline 5.1.1(v)). Service-role orchestrator:
//   1. authenticate the caller from their JWT (NEVER trust uid/email from the body)
//   2. call the transactional delete_account_data RPC (all DB work, atomic)
//   3. run the Apple-token revoke hook (NO-OP while Sign in with Apple is disabled)
//   4. auth.admin.deleteUser LAST (cannot be in the Postgres tx)
// Honest failures: if (4) fails after (2) committed, return auth_delete_failed
// (retryable; the RPC is idempotent) — never claim "no data deleted".
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Sign in with Apple is OFF (see app APPLE_SIGNIN_ENABLED). When SIWA ships this
// MUST revoke the user's Apple token here before deletion. No-op until then.
const APPLE_SIGNIN_ENABLED = false
async function revokeAppleToken(_uid: string): Promise<void> {
  if (!APPLE_SIGNIN_ENABLED) return
  throw new Error('Apple token revocation not implemented — required before SIWA ships')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors })

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. Resolve the caller from the token ONLY.
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await supa.auth.getUser(token)
  if (!u?.user) return json({ error: 'unauthorized' }, 401)
  const uid = u.user.id
  const email = u.user.email ?? ''

  // 2. Atomic DB cleanup.
  const { data: summary, error: dbErr } = await supa.rpc('delete_account_data', { p_uid: uid, p_email: email })
  if (dbErr) {
    console.error('[delete-account] db error', dbErr)
    return json({ error: 'db_failed', message: dbErr.message }, 500)
  }

  // 3. Apple revoke hook (no-op while SIWA disabled).
  try {
    await revokeAppleToken(uid)
  } catch (e) {
    console.error('[delete-account] apple revoke failed', e)
    return json({ error: 'apple_revoke_failed', summary }, 500)
  }

  // 4. Delete the auth user LAST. If this fails, DB data is already gone — say so.
  const { error: authErr } = await supa.auth.admin.deleteUser(uid)
  if (authErr) {
    console.error('[delete-account] auth delete failed', authErr)
    return json({ error: 'auth_delete_failed', summary }, 500)
  }

  return json({ ok: true, summary }, 200)
})
```

- [ ] **Step 2: Deploy** ⚙️

```bash
npx supabase functions deploy delete-account --project-ref wnpanbjzmcsvhfyjdczv
```
(Needs Supabase CLI auth — owner may run via `! npx supabase login` first. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are auto-injected for deployed functions.)

- [ ] **Step 3: Verify unauthenticated probe returns 401** ⚙️

```bash
curl.exe -s -o NUL -w "%{http_code}" -X POST \
  https://wnpanbjzmcsvhfyjdczv.supabase.co/functions/v1/delete-account \
  -H "apikey: <anon-key>"
```
Expected: `401`.

- [ ] **Step 4: Verify a real deletion** ⚙️ — sign in as a throwaway account in the app, capture its access token (DevTools → Application → localStorage `sb-...-auth-token`), then:

```bash
curl.exe -s -X POST https://wnpanbjzmcsvhfyjdczv.supabase.co/functions/v1/delete-account \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <access-token>"
```
Expected: `{"ok":true,"summary":{...}}`; the throwaway account can no longer sign in.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/delete-account/index.ts
git commit -m "feat(edge): delete-account function (auth + RPC + apple hook + auth delete)"
```

---

## Task 4 🪟 Client helper `requestAccountDeletion()`

**Files:**
- Create: `app/src/auth/deleteAccount.ts`
- Test: `app/src/auth/deleteAccount.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/auth/deleteAccount.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
}))

import { requestAccountDeletion } from './deleteAccount'

beforeEach(() => { vi.restoreAllMocks() })

describe('requestAccountDeletion', () => {
  it('returns ok on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, summary: {} }), { status: 200 })))
    expect(await requestAccountDeletion()).toEqual({ ok: true })
  })

  it('maps 401 to unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })))
    const r = await requestAccountDeletion()
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ code: 'unauthorized' })
  })

  it('maps auth_delete_failed (data removed, retryable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'auth_delete_failed' }), { status: 500 })))
    const r = await requestAccountDeletion()
    expect(r).toMatchObject({ ok: false, code: 'auth_delete_failed' })
  })

  it('maps other failures to error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'db_failed' }), { status: 500 })))
    const r = await requestAccountDeletion()
    expect(r).toMatchObject({ ok: false, code: 'error' })
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/auth/deleteAccount.test.ts`
Expected: FAIL ("requestAccountDeletion is not a function" / module not found).

- [ ] **Step 3: Implement**

```ts
// app/src/auth/deleteAccount.ts
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase'

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: 'unauthorized' | 'auth_delete_failed' | 'error'; message: string }

/**
 * Call the `delete-account` Edge Function with the current session token. The
 * function resolves the user from the token, so no uid/email is sent. Maps the
 * response to a typed result; the UI handles teardown/retry messaging.
 */
export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  let token = SUPABASE_ANON_KEY
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) token = data.session.access_token
  } catch { /* fall through */ }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/delete-account`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {
    return { ok: false, code: 'error', message: 'Network error — please try again.' }
  }

  if (res.ok) return { ok: true }
  if (res.status === 401) return { ok: false, code: 'unauthorized', message: 'Please sign in again, then retry.' }

  let body: { error?: string } = {}
  try { body = await res.json() } catch { /* ignore */ }
  if (body.error === 'auth_delete_failed') {
    return { ok: false, code: 'auth_delete_failed',
      message: 'Your data was removed, but finishing account deletion failed. Please try again.' }
  }
  return { ok: false, code: 'error', message: 'Could not delete your account. Please try again.' }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/auth/deleteAccount.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/auth/deleteAccount.ts app/src/auth/deleteAccount.test.ts
git commit -m "feat(auth): requestAccountDeletion client helper + tests"
```

---

## Task 5 🪟 `deleteAccount()` in AuthProvider (session teardown on success)

**Files:**
- Modify: `app/src/auth/AuthProvider.tsx`

- [ ] **Step 1: Add to the context type** — in the `AuthState` interface, after `signOut`:

```ts
  deleteAccount: () => Promise<import('./deleteAccount').DeleteAccountResult>
```

- [ ] **Step 2: Add the import** at the top of `AuthProvider.tsx`:

```ts
import { requestAccountDeletion } from './deleteAccount'
```

- [ ] **Step 3: Implement the callback** — add after the `signOut` useCallback:

```ts
  // Delete the account, then reuse the signOut teardown on success but land on the
  // public landing ('/') rather than '/auth'. On failure, return the result so the
  // UI can show the (possibly retryable) error and keep the user signed in.
  const deleteAccount = useCallback(async () => {
    const r = await requestAccountDeletion()
    if (r.ok) {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
      location.assign('/')
    }
    return r
  }, [])
```

- [ ] **Step 4: Expose it** — add `deleteAccount` to the provider value:

```tsx
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInGoogle, signInApple, magicLink, signOut, deleteAccount }}>
```

- [ ] **Step 5: Verify typecheck + suite**

Run: `npx tsc -b` (expect clean) then `npx vitest run` (expect 787 passing: 783 + 4 from Task 4).

- [ ] **Step 6: Commit**

```bash
git add app/src/auth/AuthProvider.tsx
git commit -m "feat(auth): deleteAccount in AuthProvider (teardown + redirect on success)"
```

---

## Task 6 🪟 `DangerConfirm` dialog (type-"DELETE")

**Files:**
- Create: `app/src/components/DangerConfirm.tsx`
- Test: `app/src/components/DangerConfirm.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/DangerConfirm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DangerConfirm } from './DangerConfirm'

function setup(props = {}) {
  const onConfirm = vi.fn(), onCancel = vi.fn()
  render(<DangerConfirm open title="Delete account" body="This cannot be undone."
    confirmWord="DELETE" confirmLabel="Delete account" onConfirm={onConfirm} onCancel={onCancel} {...props} />)
  return { onConfirm, onCancel }
}

describe('DangerConfirm', () => {
  it('disables confirm until the word matches exactly', () => {
    const { onConfirm } = setup()
    const btn = screen.getByRole('button', { name: /delete account/i })
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'delete' } })
    expect(btn).toBeDisabled()                       // case-sensitive
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel fires onCancel', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/DangerConfirm.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (reuses `Sheet`, `Button`, `Input`)

```tsx
// app/src/components/DangerConfirm.tsx
import { useState } from 'react'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

/**
 * A destructive confirm that requires typing an exact word (e.g. "DELETE") to
 * enable the action — used for account deletion. Stronger than ConfirmDialog.
 */
export function DangerConfirm({
  open, title, body, confirmWord, confirmLabel, busy, error, onCancel, onConfirm,
}: {
  open: boolean; title: string; body: string; confirmWord: string; confirmLabel: string
  busy?: boolean; error?: string; onCancel: () => void; onConfirm: () => void
}) {
  const [text, setText] = useState('')
  const matches = text === confirmWord
  return (
    <Sheet open={open} onClose={onCancel} labelledBy="danger-title">
      <h2 id="danger-title" className="font-serif text-2xl">{title}</h2>
      <p className="text-muted text-[14px] mt-2">{body}</p>
      <label className="block text-[12px] font-bold text-muted uppercase tracking-wide mt-5 mb-1.5">
        Type {confirmWord} to confirm
      </label>
      <Input aria-label={`Type ${confirmWord} to confirm`} value={text} autoComplete="off"
        onChange={e => setText(e.target.value)} className="min-h-[44px]" />
      {error && <p className="text-sig-link text-[13px] mt-2" aria-live="polite">{error}</p>}
      <div className="mt-6 flex gap-2.5">
        <Button variant="soft" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button variant="claret" className="flex-1" busy={busy} disabled={!matches || busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/DangerConfirm.test.tsx`
Expected: PASS (2 tests).

> **Note:** if `Button` lacks a `disabled` prop, add `disabled?: boolean` passed through to the underlying `<button>` in `app/src/components/ui/Button.tsx` (check first; the codebase's `Button` already forwards native props in most cases).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/DangerConfirm.tsx app/src/components/DangerConfirm.test.tsx
git commit -m "feat(ui): DangerConfirm type-to-confirm dialog + tests"
```

---

## Task 7 🪟 Wire "Delete account" into Account settings

**Files:**
- Modify: `app/src/components/AccountSettings.tsx`

- [ ] **Step 1: Add imports** at the top:

```ts
import { DangerConfirm } from './DangerConfirm'
import { useAuth } from '../auth/useAuth'
```

- [ ] **Step 2: Add state + handler** — inside the `AccountSettings` component, after the existing hooks:

```ts
  const { deleteAccount } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | undefined>(undefined)

  const onDeleteAccount = async () => {
    setDeleting(true); setDeleteErr(undefined)
    const r = await deleteAccount()
    setDeleting(false)
    if (!r.ok) setDeleteErr(r.message)  // on success the app redirects to '/'
  }
```

- [ ] **Step 3: Add the Danger zone block** — immediately before the closing `</div>` of the `mt-6 space-y-6` settings container (after the "Legal & support" section):

```tsx
        {/* Danger zone */}
        <div className="pt-1">
          <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-2">Danger zone</span>
          <button
            type="button"
            onClick={() => { setDeleteErr(undefined); setConfirmDelete(true) }}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] rounded-card border border-sig-link/40 text-[14px] font-semibold text-sig-link hover:bg-sig-link/5 transition-colors"
          >
            Delete account
          </button>
        </div>
```

- [ ] **Step 4: Mount the dialog** — just before the closing `</Sheet>` of the component:

```tsx
      <DangerConfirm
        open={confirmDelete}
        title="Delete account"
        body="Permanently deletes your account and personal data. Travels you own alone will be deleted. Shared travels you own will move to a collaborator. Travels you joined will stay with their owner, and you'll be removed. This can't be undone."
        confirmWord="DELETE"
        confirmLabel="Delete account"
        busy={deleting}
        error={deleteErr}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDeleteAccount}
      />
```

- [ ] **Step 5: Verify typecheck + full suite**

Run: `npx tsc -b` (clean) then `npx vitest run` (expect **789**: 783 + 4 helper + 2 dialog).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/AccountSettings.tsx
git commit -m "feat(ui): Danger zone Delete account in Account settings"
```

---

## Task 8 🪟+⚙️ Final verification + deploy

- [ ] **Step 1: Full green check**

Run from `app/`: `npx tsc -b` (clean) · `npx vitest run` (789 pass) · `npm run build` (succeeds; pre-existing chunk-size warning OK).

- [ ] **Step 2: Build + deploy the app** ⚙️

```bash
cd /c/Users/edwar/travel/.claude/worktrees/app-store-readiness && npx wrangler deploy
```

- [ ] **Step 3: End-to-end smoke** ⚙️ — with a **throwaway account** (not your founder account): create it, make a solo travel + a travel shared to a second test account, then Account settings → Delete account → type `DELETE` → confirm. Verify: redirected to `/`; can't sign back in; the solo travel is gone; the shared travel still shows for the second account (and is now owned by them if they were the only other member).

- [ ] **Step 4: Update handoff** — add account deletion to `handoff.md` "Shipped" once verified, noting the Apple-revoke hook is a no-op pending SIWA.

```bash
git add handoff.md && git commit -m "docs: record account deletion shipped (B2)"
```

---

## Self-review notes (coverage)

- Spec "transactional RPC" → Task 2. "Edge Function orchestrator, JWT-only, auth delete last" → Task 3. "Honest failure / auth_delete_failed retryable" → Tasks 3+4. "type-DELETE confirm" → Tasks 6+7. "transfer to earliest real member / delete / leave / scrub invites+JSON" → Task 2 (JSON scrub conditional on audit, marked AUDIT-ADJUST). "Apple revoke no-op while SIWA off, required before SIWA" → Task 3 `revokeAppleToken`. "schema audit first" → Task 1. Tests for all four behaviour cases + 401 + idempotency → Tasks 2 (DB, manual) + 4 (client, automated).
- **Known manual-test areas:** the RPC + Edge Function have no automated harness in this repo (consistent with existing edge functions) — they're verified via the documented SQL/curl steps. All automated vitest coverage is on the client helper + dialog.
- **AUDIT-ADJUST points** (Task 2): membership key (`email` vs `user_id`), invite table name/columns, and the JSON-scrub keys — the only three spots that change if Task 1's audit differs from the assumed schema.

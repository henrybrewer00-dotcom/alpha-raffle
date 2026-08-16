# Alpha Raffle

A Friday prize draw for a real school. Guides start one prize. Students put tickets in. A pie fills on a blue board. Spin. Every phone shows who won.

If you are an agent landing here cold: read this file, then `docs/STYLE.md`, then `docs/MIGRATE.md`. Do not invent product. The ritual is already decided.

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **alpha-raffle** (API base `https://ak29gamq.us-east.insforge.app`)
- **Live:** `https://ak29gamq.insforge.site`
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->

## Non-negotiables

1. **One open prize.** New prizes are `draft`. `start_prize` opens one. Error if another is `open`, `locked`, or `drawing`.
2. **Students see nothing until Start.** Empty hall copy, not a list of drafts.
3. **Live without reload.** `RaffleLiveProvider` ticks every 1s while the tab is visible, plus realtime `raffle:hall`.
4. **Nothing under the wheel until Spin.** Names live on slices. Winner is a dialog on guide and student screens.
5. **Page blue is not a slice.** Board is `#0000EF`. First slice is gold (`#FFB81C`). See `docs/STYLE.md`.
6. **No public signup.** Door is `functions/hall-login.ts`. Passwords live in `login_secrets` (PBKDF2). Auth users hold a random bridge password. Staff sign-in is behind “If you're a guide or admin”, not its own tab. Guides may change only their own password. Admins may change anyone’s.
7. **Ledger is append-only.** `ticket_balance` is maintained by triggers. Do not UPDATE balances by hand.
8. **Do not revive Stub Hall, ticket gimmicks, or a second brand.**

## Demo logins

Emails are `{handle}@{EMAIL_DOMAIN}`. Default domain: `alpha.school`. The field accepts the full email or just the handle.

| Who | Email | Password |
|---|---|---|
| Admin | `test@alpha.school` | `alpha-hall` |
| Guide | passcode, via “If you're a guide or admin” | `2468` |
| Students | `test1@alpha.school` … `test6@alpha.school` | `alpha` |

Older Alpha High handles (`mia`, `leo`, `admin`) still work. Prefer the `test*` roster in docs and tests.

## Architecture

```
browser (Vite + React)
  └─ hall-login          → session (mobile client_type)
  └─ RPCs                → enter / withdraw / start / begin_draw / complete_draw / …
  └─ raffle:hall + 1s tick → hall, desk, spin reload

Postgres
  profiles · settings · prizes · prize_entries
  ticket_ledger · daily_grant_log · draw_runs · login_secrets
```

Friday draw is two-phase so phones do not spoil the spin:

1. `begin_draw` — pick winner into a `spinning` `draw_runs` row. Staff can read it. Students cannot.
2. Wheel animates on the guide screen.
3. `complete_draw` — award, publish. Students get “You won!” / the name.

## Auth (the weird part)

InsForge auth emails are synthetic. Humans never need a real inbox.

- Frontend sends handle-or-email to `/functions/hall-login`.
- Function strips `@domain`, loads `profiles` by handle, verifies PBKDF2 against `login_secrets`.
- Session is opened with the **real** `auth.users.email` (so a domain change does not lock old people out) and the stored `bridge` password.
- `manage-users` creates `{handle}@{EMAIL_DOMAIN}` (default `alpha.school`).

Brand knobs (frontend): `VITE_SCHOOL_NAME`, `VITE_SCHOOL_SHORT`, `VITE_SCHOOL_CITY`, `VITE_EMAIL_DOMAIN`.  
Backend knob: secret `EMAIL_DOMAIN`.

## File map

| Path | Why it exists |
|---|---|
| `src/pages/Landing.tsx` | Sign in |
| `src/pages/StudentHall.tsx` | Tickets. Empty until Start |
| `src/pages/StaffDesk.tsx` | Students / Prizes / Daily / Draw |
| `src/pages/SpinFloor.tsx` | Live pie + Spin |
| `src/components/NameWheel.tsx` | Conic pie, labels |
| `src/lib/wheel.ts` | Segments, colors, spin math |
| `src/lib/live.tsx` | Socket + 1s tick |
| `src/lib/domain.ts` | Email parse, `digitValue` (never `03`) |
| `src/lib/brand.ts` | School name / domain |
| `functions/hall-login.ts` | The door |
| `functions/manage-users.ts` | Guide/admin create + password |
| `migrations/` | Apply in filename order |
| `docs/STYLE.md` | Color and type law |
| `docs/MIGRATE.md` | Stand this up somewhere else |
| `scripts/seed.mjs` | Demo roster |
| `scripts/deep-test.mjs` | Live Playwright |

## RPCs you will touch

`enter_prize` · `withdraw_prize` · `staff_adjust_tickets` · `run_daily_grant(p_force)` · `upsert_prize` · `start_prize` · `lock_prize` · `reopen_prize` · `delete_prize` · `begin_draw` · `complete_draw` · `draw_prize`

`run_daily_grant()` with no args is once per day. The desk button passes `p_force: true`.

## Gotchas already paid for

- **`SELECT INTO` on a missing `prize_entries` row is NULL.** After the select, `v_existing := COALESCE(v_existing, 0)` or adds silently fail.
- **`notify_hall_changed` cannot read `NEW.status`.** The trigger is shared with `ticket_ledger`, which has no `status`. Use `to_jsonb(NEW)`.
- **Give tickets now said “0 students”** because `daily_grant_log` already had today. Force exists for a reason.
- **One-student pie looked empty** when slice 1 was `#0000EF` on a `#0000EF` board.
- **Full-circle name at midpoint 180° is upside-down.** One slice: pin the name at 12 o’clock.
- **Desk 1s reload stomps the Daily tickets form.** Hydrate grant fields only until the guide touches them.
- **`0 + "3"` became `03`.** Coerce API numbers with `asInt` / `digitValue`. Never string-concat amounts.
- CLI: `npx -y @insforge/cli …`. Inserts are arrays. Never commit keys.

## Commands

```bash
npm install
npm run dev
npm run build
npm run seed          # needs INSFORGE_API_KEY
npm run test:live     # Playwright against the live site

npx -y @insforge/cli functions deploy hall-login --file functions/hall-login.ts
npx -y @insforge/cli functions deploy manage-users --file functions/manage-users.ts
npx -y @insforge/cli deployments deploy .
```

## If you change the wheel or the board

Check a one-student pie on the blue page. If you only see a white ring, you used page blue as a slice. Gold first.

## If you add a feature

Keep Friday linear. Do not add a feed, a shop, or a second open prize. Write like a person. Montserrat. White pages. One blue button.

# Move this raffle into another school

You are copying a Friday ritual, not a framework.

A working copy needs four things: a Postgres backend (InsForge), the SQL in `migrations/`, two edge functions, and a static frontend. Change the school name and email domain. Replace the demo accounts. That is the whole move.

## What you get

- Guide desk: students, prizes, daily tickets, draw
- Student hall: put tickets on the one open prize
- Live pie board + spin
- Winner popup on the guide and on student phones
- Demo roster: `test@alpha.school`, `test1@alpha.school` … `test6@alpha.school`

## 1. Backend

```bash
npx -y @insforge/cli login
npx -y @insforge/cli create   # or: link an existing project
npx -y @insforge/cli current
npx -y @insforge/cli secrets get ANON_KEY
```

Write `.env.local` from `.env.example`:

```bash
VITE_INSFORGE_URL=https://YOURKEY.region.insforge.app
VITE_INSFORGE_ANON_KEY=ik_...
VITE_SCHOOL_NAME=Lincoln High
VITE_SCHOOL_SHORT=LINCOLN
VITE_SCHOOL_CITY=Austin
VITE_EMAIL_DOMAIN=lincoln.school
```

Set the same domain on the backend so new students get the right email:

```bash
npx -y @insforge/cli secrets add EMAIL_DOMAIN lincoln.school
```

Point `insforge.toml` `[auth].allowed_redirect_urls` at your local ports and your live site. Keep `disable_signup = true`. Students do not self-register.

## 2. Schema

Apply every file in `migrations/` in filename order. Do not skip. Later files repair earlier ones on purpose.

```bash
npx -y @insforge/cli db migrations up --all
```

You now have: `profiles`, `settings`, `prizes`, `prize_entries`, `ticket_ledger`, `daily_grant_log`, `draw_runs`, `login_secrets`, plus RPCs and a realtime channel `raffle:hall`.

## 3. Functions

```bash
npx -y @insforge/cli functions deploy hall-login --file functions/hall-login.ts --name "Hall login"
npx -y @insforge/cli functions deploy manage-users --file functions/manage-users.ts --name "Manage users"
npx -y @insforge/cli functions deploy daily-grant --file functions/daily-grant.ts --name "Daily grant"
```

`hall-login` is public (the sign-in door). `manage-users` requires a guide or admin session.

Optional weekday cron: schedule `daily-grant` once a morning. The desk button **Give tickets now** calls `run_daily_grant(true)` and always pays, even if today already ran.

## 4. Demo people

```bash
export INSFORGE_API_KEY=...   # from `npx -y @insforge/cli secrets get API_KEY`
export EMAIL_DOMAIN=lincoln.school
npm run seed
```

Default roster (local part × your domain):

| Email | Role | Password |
|---|---|---|
| `test@…` | admin | `alpha-hall` |
| `guide@…` | guide | `2468` |
| `test1@…` … `test6@…` | student | `alpha` |

Login accepts the full email or just the local part (`test1`).

Then delete the demo students and add real ones from the desk. Or change `scripts/seed.mjs` first and never create them.

## 5. Frontend

```bash
npm install
npm run build
npx -y @insforge/cli deployments env set VITE_INSFORGE_URL "$VITE_INSFORGE_URL"
npx -y @insforge/cli deployments env set VITE_INSFORGE_ANON_KEY "$VITE_INSFORGE_ANON_KEY"
npx -y @insforge/cli deployments env set VITE_SCHOOL_NAME "Lincoln High"
npx -y @insforge/cli deployments env set VITE_SCHOOL_SHORT "LINCOLN"
npx -y @insforge/cli deployments env set VITE_SCHOOL_CITY "Austin"
npx -y @insforge/cli deployments env set VITE_EMAIL_DOMAIN lincoln.school
npx -y @insforge/cli deployments deploy .
```

Or host `dist/` anywhere static. The app is a Vite SPA.

## 6. First Friday

1. Sign in as guide (`2468`) or `test@your.domain`.
2. Daily tickets → **Give tickets now** (or wait for the cron).
3. Prizes → add drafts. They stay hidden.
4. Draw → **Start** exactly one.
5. Students open the hall and put tickets in. The pie should move without a reload.
6. **Spin**. Phones show the winner. Then start the next prize.

## Swap the brand

| What | Where |
|---|---|
| School name, city, email domain | `.env.local` / deploy env |
| Blue, gold, type | `docs/STYLE.md`, `src/index.css`, `tailwind.config.js` |
| First-slice colors | `src/lib/wheel.ts` — never the page blue |
| Header mark | `VITE_SCHOOL_SHORT` |

Do not invent a second visual system. Change the tokens, keep the quiet.

## What not to copy blindly

- This repo’s live project (`ak29gamq`) and site (`ak29gamq.insforge.site`) are Alpha High’s. Link your own.
- Never commit `.env.local`, `.env.production`, or `.insforge/`.
- `notify_hall_changed` must read `to_jsonb(NEW)`, not `NEW.status`. The ticket ledger has no `status` column.
- `enter_prize` must `COALESCE` a `SELECT INTO` that misses. Null tickets look like “add failed”.
- Public signup stays off. The door is `hall-login`.

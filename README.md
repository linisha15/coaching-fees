# Fees · Coaching fee tracking + parent portal

A working slice for a Jaipur coaching institute (4 centres, 2,600 students):
a fee ledger, an OTP parent portal with per-instalment pay links, reminders
that stop the moment an instalment is paid, a pro-rata refund calculator, a
dues dashboard by centre and batch, and a dropout-risk flag that only ever
creates a counsellor call task.

**Live demo: https://coaching-fees.vercel.app**. Sign in with any number below
and the code **123456**.

Design notes, assumptions and what was cut: **[TDD.md](TDD.md)**.

## Run it

Requires Node 22+ and a Postgres database (a free [Neon](https://neon.tech) project works).

```bash
npm install                   # also generates the Prisma client
cp .env.example .env          # then paste your DATABASE_URL (pooled) and DIRECT_URL
npx prisma migrate deploy     # creates the tables
npx prisma db seed            # 20 students, replays Apr→Nov history
npm run dev                   # http://localhost:3000
npm test                      # 57 unit tests (domain logic)
```

`ANTHROPIC_API_KEY` is optional. Without it, the counsellor explanation stays
as a template and the “Write AI draft” button says why.

## Demo walkthrough (about 5 minutes)

The clock is pinned to **2 Nov 2026** (`DEMO_TODAY`) so the brief's sample rows
read as stated. The OTP code is always **123456**. Everyone shares the same demo
data. To start fresh, sign in as accounts and press **Reset demo data**.

| Who | Mobile | What to look at |
|---|---|---|
| Parent of Ishita (STU-0587) | 98290 10002 | Part paid, 23 days overdue. Consent screen, then dues in Hindi. Toggle to English, pay ₹15,000, get the GST receipt. |
| Parent of Mohit (STU-0219) | 98290 10003 | Due in 13 days |
| Parent of Priya + Vikram | 98290 10004 | Two children, sibling discount |
| Accounts executive | 98000 00001 | Everything below |

1. **Parent pays.** Log in as Ishita's parent and pay. Then, as accounts, open
   *Dues → Ishita Sharma*: instalment 3's remaining reminders now show
   *Cancelled · paid*.
2. **Reminders.** The *Run today's reminders* button is the daily cron. It is
   idempotent: run it twice and the second run sends nothing.
3. **Unmatched queue.** Three bank credits could not be matched (no reference,
   overpayment, unknown code). Apply Tanvi's to `STU-0905-I3`. Try Yash's and
   see it refused. Use *Simulate a bank credit* with narration
   `NEFT STU-0957-I2` and ₹15,000 to watch a clean auto-match.
4. **Refunds.** Harsh Yadav (STU-0839) left on 20 Oct. The calculator shows
   each step and a pay-by date 10 days after leaving. Edit the policy tiers and
   publish v2; parents see it at `/policy`.
5. **Risk flags.** Two open flags with their three signals and points, plus
   one already marked as a false flag by a counsellor.

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest: ledger, reminders, refund, matching, risk, GST, i18n |
| `npm run lint` | ESLint |
| `npx prisma db seed` | Wipe and reseed (safe to re-run) |
| *Reset demo data* button (accounts dashboard) | Same reseed from the UI, about 5 s. Shown only when `ALLOW_DEMO_RESET="true"`; keeps users signed in |
| `POST /api/reminders/tick` with `Authorization: Bearer $CRON_SECRET` | Daily scheduler hook |

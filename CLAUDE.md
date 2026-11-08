# Coaching Fee Tracking + Parent Portal

Job-submission build. Solo, hard deadline ~24h. Brief: engineering/medical
coaching institute (Jaipur, 4 centres, 2,600 students) wants fee tracking,
a parent portal, and reminders that stop on payment.

**Ship one slice end to end and polished. Do NOT build the whole brief.**
When unsure, cut depth, not quality. Label every assumption (see bottom).

## Stack
- Next.js (App Router) + TypeScript, Tailwind, shadcn/ui
- Prisma 7 + Postgres (Neon) via @prisma/adapter-pg. DATABASE_URL = pooled,
  DIRECT_URL = direct (migrations). Deployed on Vercel (sin1). Keep the schema
  free of provider-specific features. (Started on SQLite; switched for deploy.)
- Auth: OTP login, mocked (fixed code 123456 in dev, printed to console).
- One LLM call via /api server route; key from env ANTHROPIC_API_KEY. Never commit it.

## Scope — build exactly this
Two roles: **accounts executive** and **parent**.

1. Fee ledger per student: plan → instalments → discounts → payments →
   balance → days overdue.
2. Parent portal (OTP): see dues + receipts, pay link per instalment
   (test mode) that marks it paid.
3. Reminders: scheduled before / on / after each due date, that CANCEL the
   instant that instalment is paid. (state machine)
4. Pro-rata refund calculator from a stated, configurable policy.
5. Dues dashboard by centre/batch with ageing buckets (0-30/31-60/60+).
6. AI dropout-risk flag → creates a counsellor call-task ONLY.

Stub or cut (and say so in TDD): attendance/score bulk upload, Tally export,
GST receipt PDF. Build only if core is solid and time remains.

## Hard parts — get these right, test these
- **Instalment + pro-rata refund rules.** Refund = configurable % refundable
  by weeks elapsed (MoE 2024 coaching rules: published policy, refund within
  10 days of leaving). Show the breakdown, don't just output a number.
- **Reminder state machine.** A payment event cancels that instalment's
  pending reminders. Unit-test this — it maps to the brief's success metric.
- **Unmatched payments** go to an accounts review queue. NEVER auto-mark paid.

## AI behaviour (and what happens when it's wrong)
- Risk score is DETERMINISTIC from 3 signals: missed instalments, falling
  attendance, test-score trend. Show the signals.
- LLM only writes the counsellor-facing explanation + talking points, labelled
  "AI draft". It touches no fees and messages no parent.
- Counsellor can "mark false flag". Flag creates a task, nothing else.

## Data model (sketch — finalise in schema)
User(role: parent|accounts), Student, FeePlan, Instalment(status, dueDate),
Payment(matched), Discount, Reminder(kind: before|on|after, status:
scheduled|sent|cancelled), RefundPolicy(configurable), DropoutFlag(score,
signals, explanation, status), CounsellorTask, UnmatchedPayment.

## Non-negotiables
- No secrets in repo. Validate all inputs. Enforce access control: a parent
  sees only their own student(s).
- Mobile-first, low-end phones. Design ethos: calm, minimal, lots of white
  space, large text. Parent must grasp dues in 5 seconds — amount, due date,
  pay button, nothing else. Hindi + English (i18n, or at minimum Hindi strings
  for the parent screens). GST shown on receipts.
- Loading / empty / error states on every screen. No dead buttons.
- Seed realistic sample data (use the 3 brief rows + ~15 more across centres
  and ageing states, including a part-paid overdue and an unmatched payment).

## Commands
- Scaffold: npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint
- DB: npx prisma migrate deploy / npx prisma db seed (new migration: npx prisma migrate dev)
- Test: npm test   Dev: npm run dev

## Assumptions log (keep updated — goes into the TDD)
- OTP and payments are mocked (test mode).
- Demo "today" = 2026-11-02 (env DEMO_TODAY), derived from the brief's sample
  rows (23 days overdue from 10-10; due in 13 days on 11-15). All date logic
  takes an injectable clock.
- Money stored as integer paise. Status/kind fields are strings validated with
  Zod (no Prisma enums — keeps SQLite/Postgres swappable).
- Fee plans: JEE = 4 × ₹30,000, NEET = 3 × ₹40,000 (₹1.2 lakh/yr per brief).
  Schedules are per batch (2 JEE, 2 NEET calendars); the brief's rows are JEE
  instalment 3 (10 Oct) and NEET instalment 2 (15 Nov). Discounts are per
  instalment.
- Refund = pro-rata unused fee (paid − net fee × weeksElapsed/weeksTotal, a
  started week counts) × tier %, tiers by weeks elapsed. Default (editable,
  published to parents, not given in brief): ≤4 wk 100%, ≤12 wk 90%, ≤24 wk
  80%, after that 0%. Payout ≤10 days (validator rejects >10). FLAG for client:
  any tier <100% deducts beyond pure pro-rata — confirm against MoE 2024.
  Refund of GST portion (credit note) out of scope.
- Fees are GST-inclusive (18%, intra-state CGST 9% + SGST 9%) — receipts
  back-calculate taxable value.
- A part payment does NOT cancel reminders (balance still owed); reminders
  then quote the remaining balance. If the scheduler misses days, only the
  latest due reminder is sent; older ones are "superseded".
- Auto-match only when the narration has exactly one instalment code
  (STU-xxxx-In) and amount ≤ balance. Overpayments go to the queue.
- Risk score: missed (1→20, 2+→40) + attendance drop (≥8→15, ≥15→30) + test
  drop (same), last 4 vs previous 4. Flag at ≥50.
- Reminders: before = 3 days prior, on = due date, after = 3/7 days after.
  Messages mocked as a message log, in parent's language (hi|en). No real cron:
  a "run reminders" tick processes everything due as of the clock.
- Payment matching: matched only if reference maps to an instalment AND amount
  ≤ outstanding. Anything else → UnmatchedPayment queue, never auto-paid.
- DPDP: parent records consent (timestamp) after first OTP login before
  seeing any student data.
- OTP code: MOCK_OTP_CODE env (123456 in .env.example; default in dev). Without
  it in production, codes are random and only logged — no real SMS.
- Pay link = mock gateway page; "success" calls the same ingestPayment() the
  bank feed uses. Idempotency key generated per page render.
- One accounts role also acts as counsellor (no separate counsellor login).
- Demo data lives in src/lib/server/demo-seed.ts (used by `prisma db seed` and
  the "Reset demo data" button, gated by ALLOW_DEMO_RESET=true). Reset keeps
  users/sessions but clears consent and language back to seeded values.
- Students who have left are excluded from dues/ageing; their refund is
  handled in the calculator.
- Next 16 cacheComponents is on: pages stream, so redirect/notFound happen
  in-stream. proxy.ts gives a real 307 for no-session requests; ownership is
  enforced in every page/action/route (another family's data → Not found).
  Every page reads the session, so each sets `export const instant = false`,
  and getCurrentUser() calls `connection()` before touching the clock/DB.
  New pages must do the same or Next's dev overlay flags a "Blocking Route".
- Cut: bulk upload of attendance/scores (seeded instead), real SMS/WhatsApp,
  GST PDF (receipt is a printable HTML page with GST lines), parent view of
  attendance/scores. Tally export is a CSV of receipt vouchers (stub level).
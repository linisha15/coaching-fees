# Technical design: Fees (coaching fee tracking + parent portal)

- **GitHub:** https://github.com/linisha15/coaching-fees
- **Live demo:** https://coaching-fees.vercel.app
- **Sign in:** accounts 98000 00001 · parent 98290 10002 (Ishita) · code 123456
- **Deployment:** see `deployment.md`

## 1. What this is

The client is Company A, a JEE/NEET coaching institute in Jaipur with 4
centres, 2,600 students and an average fee of ₹1.2 lakh a year paid in 3–4
instalments. About ₹79 lakh a year is lost to late, uneven follow-up and to
manual chasing.

This build is **one end-to-end slice**, shipped with two roles: parent and
accounts executive.

| # | Brief item | Status |
|---|---|---|
| 1 | Fee ledger: plan → instalments → discounts → payments → balance → days overdue | **Built** |
| 2 | Parent portal (OTP): dues, receipts with GST, pay link per instalment (test mode) | **Built** |
| 3 | Reminders before/on/after each due date that stop on payment | **Built** (state machine, unit-tested) |
| 4 | Pro-rata refund calculator from a published, configurable policy | **Built** (versioned policy) |
| 5 | Dues dashboard by centre/batch with ageing 0–30 / 31–60 / 60+ | **Built** |
| 6 | AI dropout-risk flag → counsellor call task only | **Built** (deterministic score + one LLM call) |
| — | Unmatched payments → accounts queue | **Built** |
| — | Tally export | **Stub**: CSV of receipt vouchers |
| — | GST receipt | **HTML** printable receipt with GST split; no PDF |
| — | Attendance / test-score bulk upload | **Cut**: data is seeded |
| — | Parent view of attendance and scores | **Cut**: kept off the 5-second dues screen |
| — | Real SMS/WhatsApp, real gateway, real OTP | **Mocked** |

**Screens.**
- **Parent (3):** dues, instalments and receipts, pay.
- **Accounts (5):** dues dashboard, student ledger, unmatched queue, refunds,
  risk flags.
- **Supporting pages:** login, consent, a receipt page and a public refund
  policy page.

## 2. Architecture

```
Next.js 16 (App Router, server components + server actions)
│
├─ src/lib/domain/      PURE functions. No DB, no clock, no I/O. All the rules.
│    ledger.ts          balance, status, days overdue, ageing bucket
│    reminders.ts       reminder state machine + scheduler decisions
│    refund.ts          pro-rata refund + policy schema (Zod)
│    matching.ts        payment → instalment matching rules
│    risk.ts            deterministic dropout score
│    money.ts, dates.ts paise, GST split, IST date-only arithmetic
│
├─ src/lib/server/      Thin services: load rows → call domain → persist in a tx
│    payments.ts        ingestPayment(): ONE entry point for gateway + bank money
│    reminders.ts       runReminderTick(), cancel on payment
│    auth.ts            mocked OTP, sessions, role + ownership guards
│    risk.ts            evaluateRisk(), writeAiExplanation() (the one LLM call)
│
├─ src/app/             Screens, server actions, 3 API routes
└─ prisma/              schema (Postgres, no provider-specific features), migrations, seed
```

**Why this split.** The hard parts are rules: instalments, refunds and the
reminder lifecycle. Keeping them pure means every rule is unit-tested without
a database, and screens can't drift from the rules. The DB stores raw facts
(instalments, discounts, payments). Balance, status, overdue days and ageing
are always derived. The one denormalised field, `Instalment.status`, exists for
reminder queries. It is recomputed by the domain function inside the same
transaction as the payment.

**Database.** Postgres (Neon) through Prisma 7 and `@prisma/adapter-pg`. The app
uses the pooled connection; migrations use the direct one. Development started
on SQLite, so the schema avoids provider-specific features: no Prisma enums,
statuses are strings validated in code, money is integer paise and signals are
JSON text.

**Deployment.** Vercel (Singapore region, next to the Neon database). The
`vercel-build` script generates the client, applies migrations, then builds.
Vercel Cron calls the reminder tick daily at 08:00 IST, so reminders go out
without anyone pressing a button. Details in `deployment.md`.

## 3. Data model

```
Centre 1─* Batch 1─* Student *─1 User(parent)
                      │
                      1─1 FeePlan 1─* Instalment 1─* Discount
                                         │        1─* Payment      (reference UNIQUE = idempotency key)
                                         │        1─* Reminder 1─* MessageLog
UnmatchedPayment (reference UNIQUE, status open|allocated|rejected)
RefundPolicy (version, active) 1─* RefundTier(upToWeek, refundPercent)
Student 1─* AttendanceWeek, TestScore, DropoutFlag 1─1 CounsellorTask
User 1─* Session; OtpChallenge
```

Instalment codes (`STU-0587-I3`) are the payment reference printed on pay
links and expected in bank narrations.

## 4. The hard parts

### 4.1 Ledger

For each instalment:

- `net = amount − discounts`
- `balance = max(0, net − payments)`
- status is `paid` when balance is 0, `part_paid` when something has been paid,
  and `due` otherwise
- `daysOverdue = today − dueDate` if a balance remains after the due date, else 0
- ageing bucket: 0–30, 31–60 or 60+

Ageing is **per instalment**, so a student can owe in two buckets at once. The
dashboard sums by instalment, not by student.

The brief's rows reproduce exactly at the demo date of 2 Nov 2026:

- Aarav: paid
- Ishita: ₹15,000 part paid, 23 days overdue
- Mohit: due in 13 days

The tests assert these rows.

### 4.2 Reminder state machine

```
              SEND (scheduledFor ≤ today AND instalment not paid)
  scheduled ───────────────────────────────────────────────▶ sent        (terminal)
      │
      └── CANCEL(paid | student_left | superseded) ────────▶ cancelled   (terminal)
```

- Each instalment gets reminders at −3, 0, +3 and +7 days. Slots already in
  the past when the plan is created are skipped, so a late enrolment doesn't
  receive a burst of messages.
- **A payment that settles the instalment cancels its scheduled reminders in
  the same DB transaction as the payment.** A part payment doesn't, because
  money is still owed; later reminders quote the remaining balance.
- The scheduler (`decideTick`) cancels a due reminder whose instalment is
  already paid (defence in depth). If several reminders are due at once (the
  cron was down), it sends only the latest and marks the rest `superseded`.
- Every transition is a guarded `UPDATE … WHERE status='scheduled'`, so a
  concurrent payment and tick can't both win, and re-running a tick is a no-op.
- Messages go to a `MessageLog` (mocked SMS) in the parent's language.

The tests simulate whole lifecycles day by day: nobody pays; pays before the
due date; pays after the +3 reminder; part payment; outage; double tick. The
**seed replays April to November history through the real services**, so every
sent and cancelled reminder in the demo came from the same code path.

### 4.3 Pro-rata refund

The MoE 2024 coaching guidelines require a published policy and a pro-rata
refund within 10 days of a student leaving. The calculation:

```
weeksTotal   = ceil(course days / 7)
weeksElapsed = ceil(days attended / 7)            a started week counts; capped
consumed     = netFee × weeksElapsed / weeksTotal
unused       = max(0, paid − consumed)
refund       = floor(unused × tier% / 100)        tier chosen by weeksElapsed
pay by       = leftOn + payoutDays                validator rejects > 10 days
```

The screen shows every line: fee, paid, fee for time attended, unused,
withheld share and refund. It also shows the tier applied and the pay-by date.
If the student paid less than the fee for the time attended, the shortfall is
shown and never billed. Policies are **versioned**: publishing creates v2 and
keeps v1, and `/policy` shows parents the active version in Hindi or English.

### 4.4 Payment matching

There is one entry point, `ingestPayment()`, for the gateway callback and the
bank feed. A payment is applied automatically only if the narration contains
**exactly one** instalment code, the instalment is open, and the amount is no
more than its balance. Every other case goes to the **Unmatched** queue with a
reason: no reference, several references, unknown code, already paid, more
than the balance, or an invalid amount.

The queue offers hints by student name or code, but **a person applies or
rejects each payment**. A repeated reference (UTR or gateway transaction id) is
a no-op, so double-submits and webhook retries are safe. The pay page also
issues one idempotency key per render.

## 5. AI behaviour, and what happens when it's wrong

- **The score is deterministic**, built from three signals:
  - missed instalments: 1 → 20 points, 2 or more → 40
  - attendance drop, last 4 weeks vs the previous 4: ≥8 points → 15, ≥15 → 30
  - test-score drop, same rule
- A student is flagged at 50 or more. The UI shows each signal and its points.
- **The flag's only side effect is a counsellor call task** (due in 2 days).
  It never touches fees and never messages a parent.
- **One LLM call** (`POST /api/risk/[id]/explain`, accounts only, Claude Opus
  5.5, low effort) writes the counsellor-facing paragraph and talking points.
  The output is labelled **AI draft**. The prompt forbids fee or collection
  talk and speculation about family circumstances, and passes only the
  signals and the student's first name.
- If the key is missing, the API errors or the model refuses, the template
  explanation stays and the button says why. Nothing else depends on the LLM.
  **The live demo runs without an API key**, so reviewers see this fallback:
  the score, signals and task all work, and the explanation is the template.
- **When the flag is wrong**, the counsellor marks it a *false flag*, which
  requires a reason. That closes the task and keeps an audit note. A seeded
  example (Nisha: dengue, back in class) shows this.

## 6. Security and privacy

- **Access control.** Every page, server action and API route re-checks the
  session and role. Parents reach a student or instalment only through an
  ownership-scoped query, so another family's code renders *Not found* and
  doesn't reveal whether it exists. `proxy.ts` adds a fast 307 to `/login`
  for requests without a session.
- **OTP.** Codes are hashed with the phone number. There are 5 attempts per
  code, 5 codes per 15 minutes, a 10-minute expiry, timing-safe comparison,
  and the same response whether or not the number is registered. Sessions are
  random 256-bit tokens; only their hash is stored, and the cookie is httpOnly
  and SameSite=Lax.
- **Input validation.** Zod checks phone, OTP, payment input and policy. Amounts
  are bounded, dates are calendar-checked, and reference formats are
  whitelisted. The CSV export neutralises formula injection.
- **Secrets.** `.env` is gitignored and only `.env.example` is committed.
  `ANTHROPIC_API_KEY` and `CRON_SECRET` come from the environment.
- **DPDP Act 2023.** Most students are minors, so a parent must give explicit
  consent (timestamped) before any student data is shown. The LLM receives no
  surname, phone number or fee figures.

## 7. Design

- The parent's main screen shows **amount, due date and pay button**, plus one
  line of status: "23 days overdue · ₹15,000 already paid". It is a single
  column at 360px with large type and 56px tap targets.
- Text is in Hindi and English. Parents' saved language drives both the
  portal and reminder messages, and Devanagari uses Noto Sans.
- The palette is neutral, with one blue accent. Red is reserved for overdue.
  The ageing buckets use a single-hue ordinal ramp, checked for contrast and
  colour-blind safety, and every amount is also printed as a number.
- Every screen has loading, empty and error states. Buttons disable while
  submitting, and every action reports a result inline or at page level.

## 8. Testing

- **57 unit tests** (Vitest) cover the domain layer: the brief's three rows,
  ageing boundaries, discounts, refund tiers and their boundaries, shortfall,
  policy validation, every matching outcome, GST rounding, risk scoring,
  reminder transitions and full lifecycles, and IST date formatting.
- **An end-to-end browser run** (Playwright, 41 checks) passed against a local
  production build and against the **live Vercel deployment**. It covers
  login errors, consent, Hindi, access denial, a failed then successful
  payment, the receipt, reminders cancelled after payment, idempotent ticks,
  auto-match, duplicate UTR, manual allocation, refused overpayment, the refund
  breakdown, policy validation, the risk page, AI fallback, CSV export and API
  auth. The script isn't in the repo yet; adding it under `e2e/` is the first
  follow-up.
- **Bugs found by that run and fixed:**
  - Receipts dated the previous day for payments before 05:30 IST.
  - Success messages disappeared together with the card they belonged to.
  - Pages leaned on a client-side redirect where a server redirect was needed.
  - On a slow network, parents who hadn't consented loaded the dues page first
    and were then bounced to consent.

## 9. Assumptions log

- OTP, payments, SMS and the gateway are mocked. The fixed OTP comes from
  `MOCK_OTP_CODE`.
- The demo clock is pinned to `DEMO_TODAY=2026-11-02`, because the brief's
  "23 days overdue" and "due in 13 days" only hold on that date.
- Fees are GST-inclusive at 18% (CGST 9% + SGST 9%, intra-state Rajasthan),
  and receipts back-calculate the taxable value. The GSTIN shown is a sample.
- JEE is 4 × ₹30,000 and NEET is 3 × ₹40,000. Schedules vary by batch.
  Discounts are recorded per instalment.
- **The default refund tiers are mine; the brief gives none.** ≤4 weeks: 100%,
  ≤12 weeks: 90%, ≤24 weeks: 80%, then 0%, all applied to the unused fee.
  **The client should confirm that any tier below 100% is acceptable under the
  MoE 2024 guidelines.** GST on refunds (credit notes) is out of scope.
- Part payments don't stop reminders.
- One accounts login also acts as counsellor.
- Students who have left are excluded from ageing.
- Tally export is a CSV of receipt vouchers, not Tally XML.
- The live demo is shared, and anyone can sign in with code 123456 (fake data
  only). The accounts dashboard has a **Reset demo data** button, enabled by
  `ALLOW_DEMO_RESET`, which restores the original state in about 7 seconds.
- With the clock pinned, the daily reminder job finds nothing new after its
  first run. That's expected, and the job is safe to run any number of times.

## 10. Next steps, in order

1. Commit the e2e script, and add a CI job running unit tests, a build and e2e.
2. Real gateway (Razorpay or Cashfree test mode) through a signed webhook into
   `ingestPayment()`, and an SMS/WhatsApp provider behind `MessageLog`.
3. Bulk CSV upload of attendance and scores per batch, and a read-only
   progress tab for parents.
4. Centre-scoped accounts users, an audit log of who changed what, and a
   refund approval and payout record.
5. A PDF GST invoice and Tally XML using the client's ledger names.

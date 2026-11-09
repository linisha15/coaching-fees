# Deployment

| | |
|---|---|
| **Live** | https://coaching-fees.vercel.app |
| **Code** | https://github.com/linisha15/coaching-fees (branch `main`) |
| **Hosting** | Vercel (Hobby), functions in `sin1` (Singapore) |
| **Database** | Neon Postgres, `ap-southeast-1` (Singapore) |
| **Scheduler** | Vercel Cron, daily at 08:00 IST |

## How it fits together

```
 Browser (parent phone / accounts laptop)
        │ HTTPS
        ▼
 Vercel · Next.js 16 · region sin1 ──── Vercel Cron (daily 02:30 UTC)
        │   server components, server actions,       │  GET /api/reminders/tick
        │   /api/* routes, proxy.ts                  │  Authorization: Bearer $CRON_SECRET
        │                                            ▼
        └─ Prisma 7 + @prisma/adapter-pg ─▶ Neon Postgres (pooled endpoint)
                                             ▲
            prisma migrate deploy (build) ───┘ (direct endpoint)
```

The app and database are in the same region, so each query takes about a
millisecond. Pages render in well under a second, and the full demo reset takes
about 7 seconds. The same reset run from India against the Singapore database
takes about 4 minutes.

## Every push to `main` deploys

Vercel is connected to the GitHub repo. A push to `main` starts a production
deploy, and a push to any other branch starts a preview deploy. The build runs
`npm run vercel-build`:

```
prisma generate          # generate the typed client into src/generated (gitignored)
prisma migrate deploy    # apply any new migrations to Neon (direct connection)
next build
```

Migrations are applied before the new code goes live. If a migration fails,
the build fails and the previous deployment keeps serving.

## Environment variables

All are set in Vercel under **Settings → Environment Variables** for
*Production and Preview*. None are committed; `.env.example` lists them with
placeholder values.

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon **pooled** connection string (host contains `-pooler`), used by the app at runtime. Ends with `?sslmode=verify-full`. |
| `DIRECT_URL` | yes | Neon **direct** connection string, used only by `prisma migrate deploy`. |
| `CRON_SECRET` | yes | Random string. Vercel Cron sends it as a bearer token, and `/api/reminders/tick` rejects requests without it. |
| `APP_URL` | yes | Public base URL, used in the pay links inside reminder messages. |
| `DEMO_TODAY` | demo | Pins the app's clock to `2026-11-02` so the brief's sample rows read as stated. Remove to use the real date. |
| `MOCK_OTP_CODE` | demo | Fixed OTP (`123456`) so reviewers can sign in. Without it, codes are random and only logged (there is no real SMS). |
| `ALLOW_DEMO_RESET` | demo | `true` shows the **Reset demo data** button on the accounts dashboard. |
| `ANTHROPIC_API_KEY` | optional | Enables the "Write AI draft" counsellor explanation. Not set on the live demo, so the template fallback is shown. |

`sslmode=verify-full` makes the Postgres driver fully verify the server
certificate, which removes the driver's SSL deprecation warning. Neon's
`channel_binding=require` parameter is left out because `node-postgres`
doesn't use it.

## Deploying from scratch

1. **Database.** Create a Neon project in Singapore. From **Connect**, copy
   the pooled string and the direct string (pooling on and off).
2. **Hosting.** In Vercel, choose **Add New → Project** and import the GitHub
   repo. Keep the detected Next.js settings, since `vercel.json` and the
   `vercel-build` script handle the rest.
3. **Variables.** Add the variables in the table above, then deploy. The first
   build creates all tables.
4. **Demo data.** Seed once, either locally with the `.env` pointing at Neon
   (`npx prisma db seed`), or by signing in as accounts and pressing
   **Reset demo data**.
5. **Verify.**
   - `https://<app>/` redirects to `/login`.
   - Sign in with `98000 00001` / `123456` and confirm the dashboard lists 4
     centres.
   - `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/reminders/tick`
     returns `{"sent":…,"cancelled":…}`.

## Day-2 operations

| Task | How |
|---|---|
| Restore the demo | Accounts dashboard → **Reset demo data** (or `npx prisma db seed`). Users stay signed in, and parents see the consent screen again. |
| Run reminders now | Accounts dashboard → **Run today's reminders**. The job is safe to run any number of times. |
| Schema change | Edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` locally, commit the migration and push. The next build applies it. |
| Rotate the DB password | Neon → **Roles → Reset password**. Update `DATABASE_URL` and `DIRECT_URL` in Vercel, then redeploy. Update local `.env`. |
| Roll back | Vercel → **Deployments** → previous deployment → **Promote to Production**. If the bad release ran a migration, roll back the schema with a new forward migration. |
| Logs | Vercel → project → **Logs** (runtime) and each deployment's **Build Logs**. Mocked SMS and OTP messages appear as `[mock-sms]` lines. |

Two build-log warnings are expected and harmless: npm's
`Unknown env config "cache-dir"` comes from Vercel's build image, and
`eslint@9 … no longer supported` is a development-only dependency notice.

## Local development

```bash
npm install                  # also runs prisma generate
cp .env.example .env         # paste DATABASE_URL and DIRECT_URL
npx prisma migrate deploy
npx prisma db seed
npm run dev                  # http://localhost:3000
npm test                     # 57 unit tests
```

Locally the app talks to the Singapore database from wherever you are, so the
first load of each page in dev can take several seconds. A second Neon branch
for development keeps local experiments off the live demo data.

## Before using this with real data

The demo settings are deliberately permissive. For a real deployment:

- **Remove `DEMO_TODAY`, `MOCK_OTP_CODE` and `ALLOW_DEMO_RESET`.**
- **Add an SMS provider for OTP and reminders.** It replaces the `[mock-sms]`
  log lines and the `MessageLog` mock.
- **Swap the test-mode pay page for a real gateway.** Its signed webhook calls
  the existing `ingestPayment()`.
- **Upgrade the hosting plan** if reminders must fire at an exact minute.
  Vercel Hobby runs daily crons only, within the scheduled hour.
- **Use Neon branches** for preview deployments, so previews never write to
  production data.

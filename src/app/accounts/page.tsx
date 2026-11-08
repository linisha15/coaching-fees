import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { ActionButtonForm } from "@/components/action-form";
import { AgeingBar, AgeingLegend } from "@/components/ageing";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { today } from "@/lib/server/clock";
import { listCentres, loadDues } from "@/lib/server/dashboard";
import { db } from "@/lib/server/db";
import { Flash } from "@/components/flash";
import { demoResetAllowed } from "@/lib/server/demo-seed";
import { resetDemoAction, runRemindersAction } from "./actions";
import { ResetDemoButton } from "./reset-demo-button";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

function Stat({ label, value, sub, swatch }: { label: string; value: string; sub?: string; swatch?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {swatch && <span className="inline-block size-2.5 rounded-full" style={{ background: swatch }} aria-hidden />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function DuesDashboard({ searchParams }: PageProps<"/accounts">) {
  // Layout checks too, but pages render in parallel with it: check here as well.
  await requireUser("accounts");
  const sp = await searchParams;
  const centres = await listCentres();
  const centre = typeof sp.centre === "string" && centres.includes(sp.centre) ? sp.centre : undefined;
  const at = today();
  const { rows, overdue, totals } = await loadDues(at, centre);
  const maxOverdue = Math.max(1, ...rows.map((r) => r.overduePaise));
  const dueReminders = await db.reminder.count({ where: { status: "scheduled", scheduledFor: { lte: at } } });

  const pill = (label: string, value?: string) => (
    <Link
      key={label}
      href={value ? `/accounts?centre=${encodeURIComponent(value)}` : "/accounts"}
      aria-current={centre === value ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm whitespace-nowrap",
        centre === value ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dues</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals.students} active students{centre ? ` at ${centre}` : " across all centres"}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {demoResetAllowed() && <ResetDemoButton action={resetDemoAction} />}
          <a href={`/api/export/tally${centre ? `?centre=${encodeURIComponent(centre)}` : ""}`} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
            Tally export (CSV)
          </a>
          <ActionButtonForm action={runRemindersAction} className="flex flex-col items-end">
            <SubmitButton className="h-9" pendingLabel="Running…">
              Run today’s reminders{dueReminders ? ` (${dueReminders})` : ""}
            </SubmitButton>
          </ActionButtonForm>
        </div>
      </section>

      <Flash message={sp.ok} />

      <nav className="-mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter by centre">
        {pill("All centres")}
        {centres.map((c) => pill(c, c))}
      </nav>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Overdue" value={formatINR(totals.overduePaise)} sub={`${overdue.length} students`} />
        <Stat label="0–30 days" value={formatINR(totals.buckets["0-30"])} swatch="var(--age-1)" />
        <Stat label="31–60 days" value={formatINR(totals.buckets["31-60"])} swatch="var(--age-2)" />
        <Stat label="60+ days" value={formatINR(totals.buckets["60+"])} swatch="var(--age-3)" />
        <Stat label="Due in next 30 days" value={formatINR(totals.dueSoonPaise)} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">By centre and batch</h2>
          <AgeingLegend />
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl border p-6 text-muted-foreground">No active students{centre ? ` at ${centre}` : ""}.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Centre</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="w-40">Ageing</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">60+</TableHead>
                  <TableHead className="text-right">Total outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.centre}${r.batch}`}>
                    <TableCell className="text-muted-foreground">{i === 0 || rows[i - 1].centre !== r.centre ? r.centre : ""}</TableCell>
                    <TableCell>{r.batch}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.students}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.overduePaise ? formatINR(r.overduePaise) : "—"}</TableCell>
                    <TableCell>
                      <AgeingBar buckets={r.buckets} max={maxOverdue} />
                    </TableCell>
                    {(["0-30", "31-60", "60+"] as const).map((b) => (
                      <TableCell key={b} className="text-right tabular-nums text-muted-foreground">
                        {r.buckets[b] ? formatINR(r.buckets[b]) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{formatINR(r.outstandingPaise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Overdue students</h2>
        {overdue.length === 0 ? (
          <p className="rounded-xl border p-6 text-muted-foreground">Nobody is overdue. 🎉</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Centre · batch</TableHead>
                  <TableHead className="text-right">Days overdue</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdue.map((s) => (
                  <TableRow key={s.code}>
                    <TableCell>
                      <Link href={`/accounts/students/${s.code}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{s.code}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.centre} · {s.batch}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.maxDaysOverdue}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(s.overduePaise)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.partPaid ? "Part paid" : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toISODate } from "@/lib/domain/dates";
import type { InstalmentLine } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { formatDate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { loadStudentLedger } from "@/lib/server/ledger";
import { markLeftAction } from "../../actions";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

function StatusBadge({ l }: { l: InstalmentLine }) {
  if (l.status === "paid") return <Badge variant="secondary">Paid</Badge>;
  if (l.daysOverdue > 0)
    return (
      <Badge variant="destructive">
        {l.status === "part_paid" ? "Part paid · " : ""}
        {l.daysOverdue}d overdue
      </Badge>
    );
  if (l.status === "part_paid") return <Badge variant="outline">Part paid</Badge>;
  return <Badge variant="outline">Due in {l.daysUntilDue}d</Badge>;
}

const REMINDER_LABEL: Record<string, string> = { before: "Before", on: "On due date", after: "After" };

export default async function StudentLedger({ params }: PageProps<"/accounts/students/[code]">) {
  // Layout checks too, but pages render in parallel with it: check here as well.
  await requireUser("accounts");
  const { code } = await params;
  const at = today();
  const data = await loadStudentLedger(code, at);
  if (!data) notFound();
  const { student, ledger } = data;

  const reminders = await db.reminder.findMany({
    where: { instalment: { feePlan: { studentId: student.id } } },
    include: { instalment: true, messages: true },
    orderBy: { scheduledFor: "asc" },
  });

  return (
    <div className="flex flex-col gap-10">
      <section>
        <Link href="/accounts" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dues
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
          <span className="text-sm text-muted-foreground">{student.code}</span>
          {student.status === "left" && <Badge variant="outline">Left on {formatDate(student.leftOn!)}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {student.batch.name} · {student.batch.centre.name} · Parent {student.parent.name} (+{student.parent.phone}) ·{" "}
          {student.parent.language === "hi" ? "Hindi" : "English"}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Plan (after discounts)", formatINR(ledger.totals.netPaise)],
          ["Paid", formatINR(ledger.totals.paidPaise)],
          ["Balance", formatINR(ledger.totals.balancePaise)],
          ["Overdue", ledger.totals.overduePaise ? `${formatINR(ledger.totals.overduePaise)} · ${ledger.maxDaysOverdue}d` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">{k}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Ledger · {student.feePlan?.name}</h2>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.lines.map((l) => {
                const inst = student.feePlan!.instalments.find((i) => i.id === l.id)!;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">{l.seq}</TableCell>
                    <TableCell>{formatDate(l.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(l.amountPaise)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground" title={l.discounts.map((d) => d.label).join(", ")}>
                      {l.discountPaise ? `−${formatINR(l.discountPaise)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.paidPaise ? formatINR(l.paidPaise) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{l.balancePaise ? formatINR(l.balancePaise) : "—"}</TableCell>
                    <TableCell>
                      <StatusBadge l={l} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {inst.payments.map((p) => (
                        <Link key={p.id} href={`/receipt/${p.id}`} className="block text-primary hover:underline">
                          {formatINR(p.amountPaise)} · {formatDate(p.paidAt, "en", false)} · {p.receiptNo}
                        </Link>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(ledger.totals.grossPaise)}</TableCell>
                <TableCell className="text-right tabular-nums">{ledger.totals.discountPaise ? `−${formatINR(ledger.totals.discountPaise)}` : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(ledger.totals.paidPaise)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(ledger.totals.balancePaise)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Reminders</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          3 days before, on, and 3 and 7 days after each due date. A full payment cancels the rest instantly.
        </p>
        {reminders.length === 0 ? (
          <p className="rounded-xl border p-6 text-muted-foreground">No reminders scheduled.</p>
        ) : (
          <ol className="divide-y rounded-xl border">
            {reminders.map((r) => (
              <li key={r.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[7rem_10rem_8rem_1fr] sm:items-baseline sm:gap-4">
                <span className="text-sm tabular-nums">{formatDate(r.scheduledFor)}</span>
                <span className="text-sm text-muted-foreground">
                  I{r.instalment.seq} · {REMINDER_LABEL[r.kind]} {r.offsetDays > 0 ? `(+${r.offsetDays}d)` : r.offsetDays < 0 ? `(${r.offsetDays}d)` : ""}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    r.status === "sent" && "text-foreground",
                    r.status === "scheduled" && "text-primary",
                    r.status === "cancelled" && "text-muted-foreground line-through decoration-muted-foreground/40",
                  )}
                >
                  {r.status === "cancelled" ? `Cancelled · ${r.cancelReason?.replace("_", " ")}` : r.status === "sent" ? "Sent" : "Scheduled"}
                </span>
                <span className="text-sm text-muted-foreground">{r.messages[0]?.body ?? ""}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {student.status === "active" ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Student leaving?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Stops all reminders. Then work out the refund — it must be paid within the policy’s payout window.
          </p>
          <ActionForm action={markLeftAction} className="mt-4">
            <input type="hidden" name="code" value={student.code} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Leaving date
                <Input type="date" name="leftOn" required max={toISODate(at)} defaultValue={toISODate(at)} className="h-9 w-44" />
              </label>
              <SubmitButton variant="outline" className="h-9" pendingLabel="Saving…">
                Mark as left
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : (
        <Link href={`/accounts/refunds?student=${student.code}`} className="text-primary hover:underline">
          Calculate refund for {student.name} →
        </Link>
      )}
    </div>
  );
}

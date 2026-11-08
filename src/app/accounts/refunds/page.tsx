import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/server/auth";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { daysBetween, parseISODate, toISODate } from "@/lib/domain/dates";
import { computeLedger } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { calculateRefund } from "@/lib/domain/refund";
import { formatDate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { studentInclude } from "@/lib/server/ledger";
import { loadActivePolicy } from "@/lib/server/policy";
import { publishPolicyAction } from "../actions";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

export default async function RefundsPage({ searchParams }: PageProps<"/accounts/refunds">) {
  // Layout checks too, but pages render in parallel with it: check here as well.
  await requireUser("accounts");
  const sp = await searchParams;
  const at = today();
  const [policy, students] = await Promise.all([
    loadActivePolicy(),
    db.student.findMany({ include: studentInclude, orderBy: [{ status: "desc" }, { name: "asc" }] }),
  ]);

  const code = typeof sp.student === "string" ? sp.student : undefined;
  const student = students.find((s) => s.code === code);
  let leftOn: Date | null = null;
  let inputError: string | null = null;
  if (student) {
    const raw = typeof sp.leftOn === "string" && sp.leftOn ? sp.leftOn : student.leftOn ? toISODate(student.leftOn) : toISODate(at);
    try {
      leftOn = parseISODate(raw);
    } catch {
      inputError = "Enter a valid leaving date.";
    }
  } else if (code) {
    inputError = "Student not found.";
  }

  const result =
    student && leftOn && policy
      ? (() => {
          const ledger = computeLedger(student.feePlan?.instalments ?? [], at);
          return calculateRefund({
            courseStart: student.batch.startDate,
            courseEnd: student.batch.endDate,
            leftOn,
            netFeePaise: ledger.totals.netPaise,
            paidPaise: ledger.totals.paidPaise,
            policy: { payoutDays: policy.payoutDays, tiers: policy.tiers },
          });
        })()
      : null;

  const policyRows = [...(policy?.tiers ?? []), { id: "new1", upToWeek: "", refundPercent: "" }, { id: "new2", upToWeek: "", refundPercent: "" }];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Refund calculator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Applies the published policy (v{policy?.version ?? "—"}). Every step is shown so the parent can check it.
        </p>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Student
            <select
              name="student"
              defaultValue={student?.code ?? ""}
              required
              className="h-9 w-72 rounded-lg border border-input bg-background px-2.5 text-sm"
            >
              <option value="" disabled>
                Choose a student
              </option>
              {students.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} · {s.code}
                  {s.status === "left" ? " · left" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Leaving date
            <Input type="date" name="leftOn" defaultValue={leftOn ? toISODate(leftOn) : ""} className="h-9 w-44" />
          </label>
          <Button type="submit" className="h-9">
            Calculate
          </Button>
        </form>

        {inputError && <p role="alert" className="mt-4 text-sm text-[var(--critical)]">{inputError}</p>}
        {!policy && <p className="mt-4 text-sm text-[var(--critical)]">No active refund policy. Publish one first.</p>}

        {!student && !inputError && (
          <p className="mt-10 rounded-xl border p-6 text-muted-foreground">
            Choose a student to see their refund. Students who have left are listed first.
          </p>
        )}

        {result && student && leftOn && (
          <div className="mt-8 rounded-xl border">
            <div className="border-b p-5">
              <p className="text-sm text-muted-foreground">
                {student.name} · {student.batch.name} · course {formatDate(student.batch.startDate)} – {formatDate(student.batch.endDate)}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Refund due</p>
              <p className="text-4xl font-semibold tabular-nums tracking-tight">{formatINR(result.refundPaise)}</p>
              <p className="mt-1 text-sm">
                Pay by <span className="font-medium">{formatDate(result.payByDate)}</span>
                <span className="text-muted-foreground"> · {policy!.payoutDays} days after leaving on {formatDate(leftOn)}</span>
              </p>
              {result.refundPaise > 0 && result.payByDate < at && (
                <p role="alert" className="mt-2 text-sm font-medium text-[var(--critical)]">
                  Past the payout deadline by {daysBetween(result.payByDate, at)} days. Pay now to stay within the published policy.
                </p>
              )}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {result.lines.map((l, i) => {
                  const isTotal = i === result.lines.length - 1;
                  return (
                    <tr key={l.label} className={cn("border-b last:border-0", isTotal && "font-semibold")}>
                      <td className="px-5 py-3">
                        {l.label}
                        {l.note && <span className="block text-xs font-normal text-muted-foreground">{l.note}</span>}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {l.amountPaise < 0 ? `−${formatINR(-l.amountPaise)}` : formatINR(l.amountPaise)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {result.shortfallPaise > 0 && (
              <p className="border-t px-5 py-3 text-sm text-muted-foreground">
                Paid {formatINR(result.shortfallPaise)} less than the fee for the weeks attended. Shown for information; nothing is
                billed automatically.
              </p>
            )}
            <p className="border-t px-5 py-3 text-xs text-muted-foreground">
              Weeks attended = weeks started since the course began (a part week counts). Fee for time attended = course fee ×
              weeks attended ÷ {result.weeksTotal}. GST on the refunded portion is reversed through a credit note (outside this tool).
            </p>
          </div>
        )}
      </section>

      <aside className="rounded-xl border p-5 lg:self-start">
        <h2 className="font-semibold">Refund policy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {policy ? `v${policy.version}, published ${formatDate(policy.publishedAt)}. ` : ""}Publishing creates a new version; old
          versions are kept. Parents see the current one.
        </p>
        <ActionForm action={publishPolicyAction} className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 font-normal">Up to week</th>
                <th className="pb-2 font-normal">Refund % of unused fee</th>
              </tr>
            </thead>
            <tbody>
              {policyRows.map((t) => (
                <tr key={t.id}>
                  <td className="py-1 pr-2">
                    <Input name="upToWeek" type="number" min={1} max={260} defaultValue={t.upToWeek} className="h-9" aria-label="Up to week" />
                  </td>
                  <td className="py-1">
                    <Input name="refundPercent" type="number" min={0} max={100} defaultValue={t.refundPercent} className="h-9" aria-label="Refund percent" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">After the last row: 0%. Leave rows blank to remove them.</p>
          <label className="mt-4 flex items-center justify-between gap-3 text-sm">
            Pay refund within (days)
            <Input name="payoutDays" type="number" min={1} max={10} defaultValue={policy?.payoutDays ?? 10} className="h-9 w-20" />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">MoE 2024 guidelines: at most 10 days.</p>
          <SubmitButton className="mt-4 h-9 w-full" pendingLabel="Publishing…">
            Publish new version
          </SubmitButton>
        </ActionForm>
      </aside>
    </div>
  );
}

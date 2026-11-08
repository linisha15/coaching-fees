import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/server/auth";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { computeLedger } from "@/lib/domain/ledger";
import { extractInstalmentCodes, UNMATCHED_REASON_TEXT, type UnmatchedReason } from "@/lib/domain/matching";
import { formatINR } from "@/lib/domain/money";
import { formatDate } from "@/lib/i18n";
import { today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { studentInclude } from "@/lib/server/ledger";
import { allocateAction, recordBankCreditAction, rejectAction } from "../actions";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

/** Hints only — a human still decides. Matches student names / codes in the narration. */
async function suggestionsFor(narration: string, at: Date) {
  const text = narration.toLowerCase();
  const codes = extractInstalmentCodes(narration).map((c) => c.slice(0, 8));
  const students = await db.student.findMany({ where: { status: "active" }, include: studentInclude });
  return students
    .filter((s) => codes.includes(s.code) || text.includes(s.name.toLowerCase()) || text.includes(s.name.split(" ")[0].toLowerCase() + " "))
    .flatMap((s) =>
      computeLedger(s.feePlan?.instalments ?? [], at)
        .lines.filter((l) => l.balancePaise > 0)
        .map((l) => ({ code: l.code, name: s.name, balancePaise: l.balancePaise, daysOverdue: l.daysOverdue })),
    )
    .slice(0, 4);
}

export default async function UnmatchedQueue({ searchParams }: PageProps<"/accounts/payments">) {
  // Layout checks too, but pages render in parallel with it: check here as well.
  await requireUser("accounts");
  const { ok } = await searchParams;
  const at = today();
  const [open, resolved] = await Promise.all([
    db.unmatchedPayment.findMany({ where: { status: "open" }, orderBy: { receivedAt: "asc" } }),
    db.unmatchedPayment.findMany({ where: { status: { not: "open" } }, orderBy: { resolvedAt: "desc" }, take: 10 }),
  ]);
  const hints = await Promise.all(open.map((u) => suggestionsFor(u.payerNote, at)));

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Unmatched payments</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Money that could not be tied to exactly one instalment. Nothing here has been marked paid. Apply each one to an
          instalment, or reject it and refund the payer.
        </p>
      </section>
      <Flash message={ok} />

      <section>
        {open.length === 0 ? (
          <p className="rounded-xl border p-6 text-muted-foreground">Queue is empty. Every payment received has been matched.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {open.map((u, i) => (
              <li key={u.id} className="rounded-xl border p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xl font-semibold tabular-nums">{formatINR(u.amountPaise)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(u.receivedAt)} · {u.reference}
                  </p>
                </div>
                <p className="mt-1 font-mono text-sm">“{u.payerNote}”</p>
                <p className="mt-2 text-sm text-[var(--critical)]">{UNMATCHED_REASON_TEXT[u.reason as UnmatchedReason] ?? u.reason}</p>

                {hints[i].length > 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Possible:{" "}
                    {hints[i].map((h) => (
                      <span key={h.code} className="mr-3 inline-block">
                        <span className="font-mono text-foreground">{h.code}</span> {h.name}, balance {formatINR(h.balancePaise)}
                        {h.daysOverdue ? `, ${h.daysOverdue}d overdue` : ""}
                      </span>
                    ))}
                  </p>
                )}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ActionForm action={allocateAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-sm">
                        Apply to instalment
                        <Input name="instalmentCode" placeholder="STU-0000-I1" defaultValue={hints[i].length === 1 ? hints[i][0].code : ""} className="h-9 w-40 font-mono" required />
                      </label>
                      <Input name="note" placeholder="Note (optional)" className="h-9 w-48" maxLength={200} />
                      <SubmitButton className="h-9" pendingLabel="Applying…">Apply</SubmitButton>
                    </div>
                  </ActionForm>
                  <ActionForm action={rejectAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-sm">
                        Or reject
                        <Input name="note" placeholder="e.g. refunded to payer" className="h-9 w-56" maxLength={200} required />
                      </label>
                      <SubmitButton variant="outline" className="h-9" pendingLabel="Saving…">Reject</SubmitButton>
                    </div>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border p-5">
        <h2 className="font-semibold">Simulate a bank credit</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stands in for the bank statement feed. Runs the same matcher: exactly one instalment code in the narration and an
          amount within its balance is applied automatically; anything else lands in the queue above.
        </p>
        <ActionForm action={recordBankCreditAction} className="mt-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              UTR / reference
              <Input name="reference" placeholder="UTR2026110200123" className="h-9 w-48 font-mono" required maxLength={64} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Amount (₹)
              <Input name="amount" type="number" min="1" step="0.01" placeholder="15000" className="h-9 w-32" required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Narration
              <Input name="narration" placeholder="NEFT STU-0587-I3 ANITA SHARMA" className="h-9 w-72" maxLength={200} />
            </label>
            <SubmitButton className="h-9" pendingLabel="Recording…">Record credit</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recently resolved</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {resolved.map((u) => (
              <li key={u.id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <span className="tabular-nums">
                  {formatINR(u.amountPaise)} · <span className="font-mono">{u.reference}</span>
                </span>
                <span className="text-muted-foreground">
                  {u.status === "allocated" ? "Applied" : "Rejected"} {u.resolvedAt ? formatDate(u.resolvedAt) : ""}
                  {u.resolutionNote ? ` · ${u.resolutionNote}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

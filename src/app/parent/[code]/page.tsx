import Link from "next/link";
import { notFound } from "next/navigation";
import { ParentShell } from "@/components/parent-shell";
import { computeLedger, type InstalmentLine } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { formatDate, t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { findOwnStudent, requireUser } from "@/lib/server/auth";
import { today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { studentInclude } from "@/lib/server/ledger";
import { getLang } from "@/lib/server/lang";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

function statusText(l: InstalmentLine, lang: Lang) {
  const s = t(lang);
  if (l.status === "paid") return { text: s.schedule.paid, tone: "text-[var(--good)]" };
  if (l.daysOverdue > 0) return { text: s.dues.overdueBy(l.daysOverdue), tone: "text-[var(--critical)]" };
  if (l.status === "part_paid") return { text: s.schedule.partPaid, tone: "text-muted-foreground" };
  return { text: s.schedule.upcoming, tone: "text-muted-foreground" };
}

export default async function ParentStudent({ params }: PageProps<"/parent/[code]">) {
  const { code } = await params;
  const user = await requireUser("parent");
  // Ownership check: another family's code is indistinguishable from a missing one.
  if (!(await findOwnStudent(user.id, code))) notFound();

  const lang = await getLang(user);
  const s = t(lang);
  const student = await db.student.findUniqueOrThrow({ where: { code }, include: studentInclude });
  const ledger = computeLedger(student.feePlan?.instalments ?? [], today());
  const payments = (student.feePlan?.instalments ?? [])
    .flatMap((i) => i.payments.map((p) => ({ ...p, seq: i.seq })))
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

  return (
    <ParentShell lang={lang} back="/parent">
      <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
      <p className="mt-1 text-base text-muted-foreground">
        {student.batch.name} · {student.batch.centre.name}
      </p>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-muted-foreground">{s.schedule.title}</h2>
      <ul className="mt-3 divide-y">
        {ledger.lines.map((l) => {
          const st = statusText(l, lang);
          return (
            <li key={l.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-lg">{s.schedule.instalment(l.seq)}</p>
                <p className="text-base text-muted-foreground">{formatDate(l.dueDate, lang)}</p>
                {l.discountPaise > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {s.schedule.discount} −{formatINR(l.discountPaise)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg tabular-nums">{formatINR(l.balancePaise > 0 ? l.balancePaise : l.netPaise)}</p>
                <p className={cn("text-base", st.tone)}>{st.text}</p>
                {l.balancePaise > 0 && student.status === "active" && (
                  <Link href={`/pay/${l.code}`} className="text-base font-medium text-primary underline-offset-4 hover:underline">
                    {s.dues.pay}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-muted-foreground">{s.schedule.receipts}</h2>
      {payments.length === 0 ? (
        <p className="mt-3 text-base text-muted-foreground">{s.schedule.noReceipts}</p>
      ) : (
        <ul className="mt-3 divide-y">
          {payments.map((p) => (
            <li key={p.id}>
              <Link href={`/receipt/${p.id}`} className="flex items-center justify-between py-4 hover:bg-muted/50">
                <div>
                  <p className="text-lg tabular-nums">{formatINR(p.amountPaise)}</p>
                  <p className="text-base text-muted-foreground">
                    {formatDate(p.paidAt, lang)} · {s.schedule.instalment(p.seq)}
                  </p>
                </div>
                <span className="text-base text-primary">{s.schedule.receipt} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/policy" className="mt-12 text-base text-muted-foreground underline underline-offset-4">
        {s.schedule.refundPolicy}
      </Link>
    </ParentShell>
  );
}

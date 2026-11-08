import { notFound, redirect } from "next/navigation";
import { ParentShell } from "@/components/parent-shell";
import { PrintButton } from "@/components/print-button";
import { formatINR, gstBreakdown } from "@/lib/domain/money";
import { formatDate, t } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { getLang } from "@/lib/server/lang";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

const METHOD: Record<string, string> = {
  gateway_test: "Online (test gateway)",
  bank: "Bank transfer",
  manual_allocation: "Bank transfer (applied by accounts)",
};

export default async function ReceiptPage({ params, searchParams }: PageProps<"/receipt/[id]">) {
  const { id } = await params;
  const isNew = (await searchParams).new === "1";
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const payment = await db.payment.findUnique({
    where: { id },
    include: { instalment: { include: { feePlan: { include: { student: { include: { batch: { include: { centre: true } } } } } } } } },
  });
  const student = payment?.instalment.feePlan.student;
  // Parents: own children only. Accounts: any.
  if (!payment || !student || (user.role === "parent" && student.parentId !== user.id)) notFound();

  const lang = await getLang(user);
  const s = t(lang).receipt;
  const gst = gstBreakdown(payment.amountPaise, payment.instalment.feePlan.gstRateBps);
  const rate = payment.instalment.feePlan.gstRateBps / 200; // per half (CGST/SGST)

  const rows: [string, string][] = [
    [s.receiptNo, payment.receiptNo],
    [s.date, formatDate(payment.paidAt, lang)],
    [s.student, `${student.name} (${student.code})`],
    [s.towards, `${t(lang).schedule.instalment(payment.instalment.seq)} · ${student.batch.name}`],
    [s.method, METHOD[payment.method] ?? payment.method],
  ];

  return (
    <ParentShell lang={lang} back={user.role === "parent" ? `/parent/${student.code}` : `/accounts/students/${student.code}`}>
      {isNew && (
        <p role="status" className="mb-8 text-2xl font-medium text-[var(--good)]">
          ✓ {formatINR(payment.amountPaise)}
        </p>
      )}
      <article className="rounded-xl border p-5">
        <header className="border-b pb-4">
          <p className="font-semibold">Company A Coaching Institute</p>
          <p className="text-sm text-muted-foreground">{student.batch.centre.name}, Jaipur, Rajasthan</p>
          <p className="text-sm text-muted-foreground">{s.gstin}: 08ABCDE1234F1Z5 (sample)</p>
          <h1 className="mt-4 text-lg font-semibold">{s.title}</h1>
        </header>
        <dl className="divide-y text-base">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <dl className="mt-2 border-t pt-2 text-base tabular-nums">
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">{s.taxable}</dt>
            <dd>{formatINR(gst.taxablePaise)}</dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">{s.cgst} @ {rate}%</dt>
            <dd>{formatINR(gst.cgstPaise)}</dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">{s.sgst} @ {rate}%</dt>
            <dd>{formatINR(gst.sgstPaise)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t pt-3 text-lg font-semibold">
            <dt>{s.total}</dt>
            <dd>{formatINR(payment.amountPaise)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">{s.sac}</p>
      </article>
      <PrintButton label={s.print} />
    </ParentShell>
  );
}

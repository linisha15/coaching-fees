import { randomBytes } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ParentShell } from "@/components/parent-shell";
import { computeInstalment } from "@/lib/domain/ledger";
import { formatINR, gstBreakdown } from "@/lib/domain/money";
import { formatDate, t } from "@/lib/i18n";
import { findOwnInstalment, requireUser } from "@/lib/server/auth";
import { today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { getLang } from "@/lib/server/lang";
import { instalmentInclude } from "@/lib/server/ledger";
import { PayForm } from "./pay-form";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

export default async function PayPage({ params }: PageProps<"/pay/[code]">) {
  const { code } = await params;
  const user = await requireUser("parent");
  const owned = await findOwnInstalment(user.id, code);
  if (!owned) notFound();

  const lang = await getLang(user);
  const s = t(lang);
  const inst = await db.instalment.findUniqueOrThrow({
    where: { id: owned.id },
    include: { ...instalmentInclude, feePlan: { include: { student: true } } },
  });
  const line = computeInstalment(inst, today());
  const student = inst.feePlan.student;

  return (
    <ParentShell lang={lang} back={`/parent`}>
      <p className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground">{s.pay.testMode}</p>

      <h1 className="mt-10 text-base text-muted-foreground">
        {s.pay.title} · {student.name}
      </h1>

      {line.balancePaise === 0 ? (
        <>
          <p className="mt-4 text-2xl font-medium text-[var(--good)]">✓ {s.pay.alreadyPaid}</p>
          <Link href={`/parent/${student.code}`} className="mt-8 text-base text-primary underline underline-offset-4">
            {s.dues.viewAll}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">{formatINR(line.balancePaise)}</p>
          <p className="mt-3 text-lg">
            {s.schedule.instalment(inst.seq)} · {s.dues.dueOn} {formatDate(inst.dueDate, lang)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            incl. GST {formatINR(gstBreakdown(line.balancePaise).cgstPaise + gstBreakdown(line.balancePaise).sgstPaise)}
          </p>
          <PayForm
            code={inst.code}
            reference={`pay_test_${randomBytes(8).toString("hex")}`}
            labels={{ pay: `${s.pay.payNow} ${formatINR(line.balancePaise)}`, fail: s.pay.fail }}
          />
        </>
      )}
    </ParentShell>
  );
}

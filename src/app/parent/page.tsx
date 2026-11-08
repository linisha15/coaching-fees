import Link from "next/link";
import { ParentShell } from "@/components/parent-shell";
import { buttonVariants } from "@/components/ui/button";
import { computeLedger } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { formatDate, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/server/auth";
import { today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { studentInclude } from "@/lib/server/ledger";
import { getLang } from "@/lib/server/lang";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

/** The five-second screen: amount, due date, pay button. Nothing else. */
export default async function ParentDues() {
  const user = await requireUser("parent");
  const lang = await getLang(user);
  const s = t(lang);
  const at = today();

  const children = await db.student.findMany({
    where: { parentId: user.id },
    include: studentInclude,
    orderBy: { name: "asc" },
  });

  return (
    <ParentShell lang={lang}>
      {children.length === 0 && <p className="text-lg text-muted-foreground">{s.dues.noStudents}</p>}

      <div className="flex flex-col gap-14">
        {children.map((child) => {
          const ledger = computeLedger(child.feePlan?.instalments ?? [], at);
          const next = ledger.next;
          const moreOverdue = ledger.totals.overduePaise - (next && next.daysOverdue > 0 ? next.balancePaise : 0);

          return (
            <section key={child.id} aria-labelledby={`h-${child.code}`}>
              <h2 id={`h-${child.code}`} className="text-base text-muted-foreground">
                {child.name}
                {child.status === "left" && " · left"}
              </h2>

              {next ? (
                <>
                  <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">{formatINR(next.balancePaise)}</p>
                  <p className="mt-3 text-lg">
                    {s.dues.dueOn} {formatDate(next.dueDate, lang)}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-lg",
                      next.daysOverdue > 0 ? "font-medium text-[var(--critical)]" : "text-muted-foreground",
                    )}
                  >
                    {next.daysOverdue > 0 ? s.dues.overdueBy(next.daysOverdue) : s.dues.dueIn(next.daysUntilDue)}
                    {next.paidPaise > 0 && <span className="text-muted-foreground"> · {s.dues.partPaid(formatINR(next.paidPaise))}</span>}
                  </p>
                  {moreOverdue > 0 && (
                    <p className="mt-1 text-base text-muted-foreground">+ {formatINR(moreOverdue)} {s.schedule.overdue.toLowerCase()}</p>
                  )}
                  {child.status === "active" && (
                    <Link
                      href={`/pay/${next.code}`}
                      className={cn(buttonVariants(), "mt-6 h-14 w-full text-lg")}
                    >
                      {s.dues.pay} {formatINR(next.balancePaise)}
                    </Link>
                  )}
                </>
              ) : (
                <p className="mt-3 text-2xl font-medium text-[var(--good)]">✓ {s.dues.allPaid}</p>
              )}

              <Link
                href={`/parent/${child.code}`}
                className="mt-4 block py-2 text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {s.dues.viewAll} →
              </Link>
            </section>
          );
        })}
      </div>
    </ParentShell>
  );
}

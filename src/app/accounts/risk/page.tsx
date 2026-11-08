import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { ActionButtonForm, ActionForm } from "@/components/action-form";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RISK_THRESHOLD, type RiskSignals } from "@/lib/domain/risk";
import { formatDate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { db } from "@/lib/server/db";
import { parseSignals } from "@/lib/server/risk";
import { evaluateRiskAction, reviewFlagAction } from "../actions";
import { AiDraftButton } from "./ai-draft-button";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

function SignalRow({ label, points, detail }: { label: string; points: number; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span>
        {label} <span className="text-muted-foreground">· {detail}</span>
      </span>
      <span className={cn("tabular-nums", points ? "font-medium" : "text-muted-foreground")}>+{points}</span>
    </div>
  );
}

function Signals({ s }: { s: RiskSignals }) {
  const trend = (x: RiskSignals["attendance"]) =>
    x.previousAvg === null || x.recentAvg === null ? "not enough data" : `${x.previousAvg}% → ${x.recentAvg}% (last 4 vs previous 4)`;
  return (
    <div className="divide-y">
      <SignalRow label="Missed instalments" points={s.missedInstalments.points} detail={`${s.missedInstalments.count} overdue`} />
      <SignalRow label="Attendance" points={s.attendance.points} detail={trend(s.attendance)} />
      <SignalRow label="Test scores" points={s.testScores.points} detail={trend(s.testScores)} />
    </div>
  );
}

export default async function RiskPage({ searchParams }: PageProps<"/accounts/risk">) {
  // Layout checks too, but pages render in parallel with it: check here as well.
  await requireUser("accounts");
  const { ok } = await searchParams;
  const flags = await db.dropoutFlag.findMany({
    include: { student: { include: { batch: { include: { centre: true } }, parent: true } }, task: true },
    orderBy: [{ status: "asc" }, { score: "desc" }],
  });
  const open = flags.filter((f) => f.status === "open");
  const reviewed = flags.filter((f) => f.status !== "open");

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dropout risk</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Score = fixed points from three signals; flagged at {RISK_THRESHOLD}+. A flag only creates a counsellor call task — it
            never changes fees or messages a parent. The written explanation is an AI draft for the counsellor.
          </p>
        </div>
        <ActionButtonForm action={evaluateRiskAction} className="flex flex-col items-end">
          <SubmitButton variant="outline" className="h-9" pendingLabel="Scoring…">
            Re-score all students
          </SubmitButton>
        </ActionButtonForm>
      </section>
      <Flash message={ok} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Open call tasks ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-xl border p-6 text-muted-foreground">No open flags.</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {open.map((f) => (
              <li key={f.id} className="flex flex-col rounded-xl border p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <Link href={`/accounts/students/${f.student.code}`} className="font-semibold hover:underline">
                      {f.student.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {f.student.batch.name} · {f.student.batch.centre.name}
                    </p>
                  </div>
                  <p className="text-right">
                    <span className="text-2xl font-semibold tabular-nums">{f.score}</span>
                    <span className="text-sm text-muted-foreground">/100</span>
                  </p>
                </div>
                <div className="mt-3">
                  <Signals s={parseSignals(f.signals)} />
                </div>
                <div className="mt-4 rounded-lg bg-muted/60 p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {f.explanationSource === "ai" ? <Badge variant="outline">AI draft</Badge> : <Badge variant="outline">Template</Badge>}
                    For the counsellor · not sent to the parent
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{f.explanation}</p>
                  <AiDraftButton flagId={f.id} hasAi={f.explanationSource === "ai"} />
                </div>
                <p className="mt-4 text-sm">
                  Task: call {f.student.parent.name} (+{f.student.parent.phone}) by{" "}
                  <span className="font-medium">{f.task ? formatDate(f.task.dueBy) : "—"}</span>
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ActionForm action={reviewFlagAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="decision" value="actioned" />
                    <Input name="note" placeholder="Call notes (optional)" className="h-9" maxLength={500} />
                    <SubmitButton className="mt-2 h-9 w-full" pendingLabel="Saving…">Call done</SubmitButton>
                  </ActionForm>
                  <ActionForm action={reviewFlagAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="decision" value="false_flag" />
                    <Input name="note" placeholder="Why it’s wrong (required)" className="h-9" maxLength={500} required />
                    <SubmitButton variant="outline" className="mt-2 h-9 w-full" pendingLabel="Saving…">Mark false flag</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Reviewed</h2>
          <ul className="divide-y rounded-xl border">
            {reviewed.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{f.student.name}</span> · score {f.score}
                </span>
                <span className="text-muted-foreground">
                  {f.status === "false_flag" ? "False flag" : "Call done"}
                  {f.reviewedAt ? ` · ${formatDate(f.reviewedAt)}` : ""}
                  {f.reviewNote ? ` · “${f.reviewNote}”` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

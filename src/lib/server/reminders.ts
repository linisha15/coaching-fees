import { computeInstalment } from "@/lib/domain/ledger";
import {
  decideTick,
  remindersToCancelOnPayment,
  type CancelReason,
  type ReminderKind,
  type ReminderStatus,
} from "@/lib/domain/reminders";
import { isLang } from "@/lib/i18n";
import { renderReminder } from "@/lib/reminder-messages";
import { db, type Tx } from "./db";
import { instalmentInclude } from "./ledger";

export function payUrl(instalmentCode: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/pay/${instalmentCode}`;
}

/** Cancel every still-scheduled reminder of an instalment. Returns count. */
export async function cancelPendingReminders(tx: Tx, instalmentId: string, reason: CancelReason, at: Date) {
  const pending = await tx.reminder.findMany({ where: { instalmentId, status: "scheduled" } });
  const ids = pending.map((r) => r.id);
  if (ids.length === 0) return 0;
  // `status: "scheduled"` in the WHERE makes this safe against a concurrent send.
  const res = await tx.reminder.updateMany({
    where: { id: { in: ids }, status: "scheduled" },
    data: { status: "cancelled", cancelledAt: at, cancelReason: reason },
  });
  return res.count;
}

/** Called inside the payment transaction, after the instalment status is refreshed. */
export async function onInstalmentPaymentRecorded(
  tx: Tx,
  instalmentId: string,
  statusAfter: "due" | "part_paid" | "paid",
  at: Date,
) {
  const reminders = await tx.reminder.findMany({ where: { instalmentId } });
  const ids = remindersToCancelOnPayment(
    statusAfter,
    reminders.map((r) => ({ ...r, status: r.status as ReminderStatus })),
  );
  if (ids.length === 0) return 0;
  const res = await tx.reminder.updateMany({
    where: { id: { in: ids }, status: "scheduled" },
    data: { status: "cancelled", cancelledAt: at, cancelReason: "paid" },
  });
  return res.count;
}

export type TickSummary = { sent: number; cancelled: number };

/**
 * The scheduler. Idempotent: safe to run any number of times per day.
 * In production this is a daily cron hitting POST /api/reminders/tick.
 */
export async function runReminderTick(at: Date): Promise<TickSummary> {
  const due = await db.reminder.findMany({
    where: { status: "scheduled", scheduledFor: { lte: at } },
    include: {
      instalment: {
        include: { ...instalmentInclude, feePlan: { include: { student: { include: { parent: true } } } } },
      },
    },
  });

  const byId = new Map(due.map((r) => [r.id, r]));
  const lineFor = (instalmentId: string) => {
    const r = due.find((x) => x.instalmentId === instalmentId)!;
    return computeInstalment(r.instalment, at);
  };

  const decision = decideTick(
    due.map((r) => ({ ...r, status: r.status as ReminderStatus })),
    (instalmentId) => lineFor(instalmentId).status,
    at,
  );

  let sent = 0;
  let cancelled = 0;

  for (const c of decision.cancel) {
    const res = await db.reminder.updateMany({
      where: { id: c.id, status: "scheduled" },
      data: { status: "cancelled", cancelledAt: at, cancelReason: c.reason },
    });
    cancelled += res.count;
  }

  for (const id of decision.send) {
    const r = byId.get(id)!;
    const student = r.instalment.feePlan.student;
    if (student.status !== "active") {
      cancelled += (
        await db.reminder.updateMany({
          where: { id, status: "scheduled" },
          data: { status: "cancelled", cancelledAt: at, cancelReason: "student_left" },
        })
      ).count;
      continue;
    }
    const line = lineFor(r.instalmentId);
    const lang = isLang(student.parent.language) ? student.parent.language : "en";
    const body = renderReminder(lang, {
      kind: r.kind as ReminderKind,
      studentName: student.name.split(" ")[0],
      seq: r.instalment.seq,
      balancePaise: line.balancePaise,
      dueDate: r.instalment.dueDate,
      daysOverdue: line.daysOverdue,
      payUrl: payUrl(r.instalment.code),
    });

    await db.$transaction(async (tx) => {
      // Guarded transition: only one sender can move scheduled → sent.
      const res = await tx.reminder.updateMany({
        where: { id, status: "scheduled" },
        data: { status: "sent", sentAt: at },
      });
      if (res.count === 0) return;
      await tx.messageLog.create({
        data: { reminderId: id, userId: student.parentId, language: lang, body, createdAt: at },
      });
      sent += 1;
    });
  }

  return { sent, cancelled };
}

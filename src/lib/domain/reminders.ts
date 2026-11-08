// Reminder state machine.
//
//            ┌──── SEND (on/after scheduledFor, instalment unpaid) ───▶ sent
//  scheduled ┤
//            └──── CANCEL (paid | student_left | superseded) ─────────▶ cancelled
//
// `sent` and `cancelled` are terminal. A payment that settles an instalment
// cancels every still-scheduled reminder for that instalment. A part payment
// does not: money is still owed, so reminders continue (with the new balance).

import { addDays } from "./dates";

export type ReminderKind = "before" | "on" | "after";
export type ReminderStatus = "scheduled" | "sent" | "cancelled";
export type CancelReason = "paid" | "student_left" | "superseded";

/** Offsets relative to the due date. Configurable here, nowhere else. */
export const REMINDER_SCHEDULE: readonly { kind: ReminderKind; offsetDays: number }[] = [
  { kind: "before", offsetDays: -3 },
  { kind: "on", offsetDays: 0 },
  { kind: "after", offsetDays: 3 },
  { kind: "after", offsetDays: 7 },
];

export type ReminderState = {
  status: ReminderStatus;
  sentAt?: Date;
  cancelledAt?: Date;
  cancelReason?: CancelReason;
};

export type ReminderEvent =
  | { type: "SEND"; at: Date }
  | { type: "CANCEL"; at: Date; reason: CancelReason };

export class InvalidTransitionError extends Error {
  constructor(from: ReminderStatus, event: ReminderEvent["type"]) {
    super(`Cannot ${event} a reminder that is already ${from}`);
    this.name = "InvalidTransitionError";
  }
}

export function transition(state: ReminderState, event: ReminderEvent): ReminderState {
  if (state.status !== "scheduled") throw new InvalidTransitionError(state.status, event.type);
  switch (event.type) {
    case "SEND":
      return { status: "sent", sentAt: event.at };
    case "CANCEL":
      return { status: "cancelled", cancelledAt: event.at, cancelReason: event.reason };
  }
}

export type PlannedReminder = { kind: ReminderKind; offsetDays: number; scheduledFor: Date };

/**
 * Reminders for an instalment. Slots that are already in the past when the
 * plan is created are skipped, so a late-created instalment never fires a
 * burst of stale reminders.
 */
export function planReminders(dueDate: Date, createdOn: Date): PlannedReminder[] {
  return REMINDER_SCHEDULE.map((s) => ({ ...s, scheduledFor: addDays(dueDate, s.offsetDays) })).filter(
    (r) => r.scheduledFor.getTime() >= createdOn.getTime(),
  );
}

export type ReminderRow = {
  id: string;
  instalmentId: string;
  scheduledFor: Date;
  status: ReminderStatus;
};

/** Ids to cancel when a payment is recorded against an instalment. */
export function remindersToCancelOnPayment(
  instalmentStatusAfterPayment: "due" | "part_paid" | "paid",
  reminders: ReminderRow[],
): string[] {
  if (instalmentStatusAfterPayment !== "paid") return [];
  return reminders.filter((r) => r.status === "scheduled").map((r) => r.id);
}

export type TickDecision = {
  send: string[];
  cancel: { id: string; reason: CancelReason }[];
};

/**
 * What the scheduler should do at `today`, given reminders and the current
 * status of their instalments.
 *  - due + instalment paid         → cancel (defence in depth; payment should
 *                                     already have cancelled it)
 *  - several due for one instalment → send only the latest, supersede the rest
 *                                     (e.g. scheduler was down for a few days)
 *  - not yet due                    → leave scheduled
 */
export function decideTick(
  reminders: ReminderRow[],
  instalmentStatus: (instalmentId: string) => "due" | "part_paid" | "paid",
  today: Date,
): TickDecision {
  const decision: TickDecision = { send: [], cancel: [] };
  const dueByInstalment = new Map<string, ReminderRow[]>();

  for (const r of reminders) {
    if (r.status !== "scheduled" || r.scheduledFor.getTime() > today.getTime()) continue;
    if (instalmentStatus(r.instalmentId) === "paid") {
      decision.cancel.push({ id: r.id, reason: "paid" });
      continue;
    }
    const list = dueByInstalment.get(r.instalmentId) ?? [];
    list.push(r);
    dueByInstalment.set(r.instalmentId, list);
  }

  for (const list of dueByInstalment.values()) {
    list.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
    const latest = list.pop()!;
    decision.send.push(latest.id);
    for (const stale of list) decision.cancel.push({ id: stale.id, reason: "superseded" });
  }
  return decision;
}

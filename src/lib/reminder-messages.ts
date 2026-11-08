import { formatDate, type Lang } from "./i18n";
import { formatINR } from "./domain/money";
import type { ReminderKind } from "./domain/reminders";

export type ReminderMessageInput = {
  kind: ReminderKind;
  studentName: string;
  seq: number;
  balancePaise: number;
  dueDate: Date;
  daysOverdue: number;
  payUrl: string;
};

/** SMS-length reminder in the parent's language (mocked send). */
export function renderReminder(lang: Lang, m: ReminderMessageInput): string {
  const amount = formatINR(m.balancePaise);
  const date = formatDate(m.dueDate, lang, false);
  if (lang === "hi") {
    const lead =
      m.kind === "before"
        ? `याद दिलाना: ${m.studentName} की किस्त ${m.seq} के ${amount} ${date} को देय हैं।`
        : m.kind === "on"
          ? `आज अंतिम तिथि: ${m.studentName} की किस्त ${m.seq} के ${amount} आज देय हैं।`
          : `${m.studentName} की किस्त ${m.seq} के ${amount} ${m.daysOverdue} दिन से बकाया हैं।`;
    return `${lead} भुगतान करें: ${m.payUrl}`;
  }
  const lead =
    m.kind === "before"
      ? `Reminder: ${amount} for ${m.studentName} (instalment ${m.seq}) is due on ${date}.`
      : m.kind === "on"
        ? `Due today: ${amount} for ${m.studentName} (instalment ${m.seq}).`
        : `${amount} for ${m.studentName} (instalment ${m.seq}) is ${m.daysOverdue} days overdue.`;
  return `${lead} Pay: ${m.payUrl}`;
}

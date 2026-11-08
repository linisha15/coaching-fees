// Fee ledger: plan → instalments → discounts → payments → balance → overdue.
// Pure functions. The DB stores raw facts; everything here is derived.

import { daysBetween } from "./dates";

export type InstalmentStatus = "due" | "part_paid" | "paid";
export type AgeingBucket = "not_due" | "0-30" | "31-60" | "60+";

export const AGEING_BUCKETS: readonly AgeingBucket[] = ["0-30", "31-60", "60+"];

export type InstalmentInput = {
  id: string;
  code: string;
  seq: number;
  dueDate: Date;
  amountPaise: number;
  discounts: { label: string; amountPaise: number }[];
  payments: { amountPaise: number; paidAt: Date }[];
};

export type InstalmentLine = InstalmentInput & {
  discountPaise: number;
  netPaise: number;
  paidPaise: number;
  balancePaise: number;
  status: InstalmentStatus;
  /** 0 unless a balance remains after the due date. */
  daysOverdue: number;
  /** Negative once past due. */
  daysUntilDue: number;
  bucket: AgeingBucket;
};

export type Ledger = {
  lines: InstalmentLine[];
  totals: {
    grossPaise: number;
    discountPaise: number;
    netPaise: number;
    paidPaise: number;
    balancePaise: number;
    overduePaise: number;
  };
  /** Days overdue of the oldest unpaid instalment. */
  maxDaysOverdue: number;
  bucket: AgeingBucket;
  /** Earliest instalment with a balance — what the parent should pay next. */
  next: InstalmentLine | null;
};

export function ageingBucket(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return "not_due";
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  return "60+";
}

const sum = (xs: { amountPaise: number }[]) => xs.reduce((a, x) => a + x.amountPaise, 0);

export function computeInstalment(i: InstalmentInput, today: Date): InstalmentLine {
  if (!Number.isInteger(i.amountPaise) || i.amountPaise < 0) {
    throw new Error(`Instalment ${i.code}: amount must be a non-negative integer (paise)`);
  }
  const discountPaise = sum(i.discounts);
  if (discountPaise > i.amountPaise) {
    throw new Error(`Instalment ${i.code}: discounts exceed instalment amount`);
  }
  const netPaise = i.amountPaise - discountPaise;
  const paidPaise = sum(i.payments);
  const balancePaise = Math.max(0, netPaise - paidPaise);

  const status: InstalmentStatus =
    balancePaise === 0 ? "paid" : paidPaise > 0 ? "part_paid" : "due";

  const daysUntilDue = daysBetween(today, i.dueDate);
  const daysOverdue = balancePaise > 0 && daysUntilDue < 0 ? -daysUntilDue : 0;

  return {
    ...i,
    discountPaise,
    netPaise,
    paidPaise,
    balancePaise,
    status,
    daysOverdue,
    daysUntilDue,
    bucket: ageingBucket(daysOverdue),
  };
}

export function computeLedger(instalments: InstalmentInput[], today: Date): Ledger {
  const lines = [...instalments]
    .sort((a, b) => a.seq - b.seq)
    .map((i) => computeInstalment(i, today));

  const totals = lines.reduce(
    (t, l) => ({
      grossPaise: t.grossPaise + l.amountPaise,
      discountPaise: t.discountPaise + l.discountPaise,
      netPaise: t.netPaise + l.netPaise,
      paidPaise: t.paidPaise + l.paidPaise,
      balancePaise: t.balancePaise + l.balancePaise,
      overduePaise: t.overduePaise + (l.daysOverdue > 0 ? l.balancePaise : 0),
    }),
    { grossPaise: 0, discountPaise: 0, netPaise: 0, paidPaise: 0, balancePaise: 0, overduePaise: 0 },
  );

  const maxDaysOverdue = Math.max(0, ...lines.map((l) => l.daysOverdue));
  const next =
    [...lines]
      .filter((l) => l.balancePaise > 0)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null;

  return { lines, totals, maxDaysOverdue, bucket: ageingBucket(maxDaysOverdue), next };
}

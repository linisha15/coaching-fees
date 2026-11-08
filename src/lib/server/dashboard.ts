import { computeLedger, type AgeingBucket } from "@/lib/domain/ledger";
import { daysBetween } from "@/lib/domain/dates";
import { db } from "./db";
import { studentInclude } from "./ledger";

export type BucketAmounts = Record<Exclude<AgeingBucket, "not_due">, number>;

export type BatchRow = {
  centre: string;
  batch: string;
  students: number;
  outstandingPaise: number;
  overduePaise: number;
  dueSoonPaise: number;
  buckets: BucketAmounts;
};

export type OverdueStudent = {
  code: string;
  name: string;
  centre: string;
  batch: string;
  overduePaise: number;
  maxDaysOverdue: number;
  bucket: AgeingBucket;
  partPaid: boolean;
};

const emptyBuckets = (): BucketAmounts => ({ "0-30": 0, "31-60": 0, "60+": 0 });

/** Ageing is per instalment: a student can owe in two buckets at once. */
export async function loadDues(at: Date, centre?: string) {
  const students = await db.student.findMany({
    where: { status: "active", ...(centre ? { batch: { centre: { name: centre } } } : {}) },
    include: studentInclude,
  });

  const rows = new Map<string, BatchRow>();
  const overdue: OverdueStudent[] = [];
  const totals = { outstandingPaise: 0, overduePaise: 0, dueSoonPaise: 0, buckets: emptyBuckets(), students: students.length };

  for (const s of students) {
    const ledger = computeLedger(s.feePlan?.instalments ?? [], at);
    const key = `${s.batch.centre.name}|${s.batch.name}`;
    const row =
      rows.get(key) ??
      ({ centre: s.batch.centre.name, batch: s.batch.name, students: 0, outstandingPaise: 0, overduePaise: 0, dueSoonPaise: 0, buckets: emptyBuckets() } as BatchRow);
    row.students++;

    for (const l of ledger.lines) {
      if (l.balancePaise === 0) continue;
      row.outstandingPaise += l.balancePaise;
      totals.outstandingPaise += l.balancePaise;
      if (l.bucket !== "not_due") {
        row.buckets[l.bucket] += l.balancePaise;
        row.overduePaise += l.balancePaise;
        totals.buckets[l.bucket] += l.balancePaise;
        totals.overduePaise += l.balancePaise;
      } else if (daysBetween(at, l.dueDate) <= 30) {
        row.dueSoonPaise += l.balancePaise;
        totals.dueSoonPaise += l.balancePaise;
      }
    }
    rows.set(key, row);

    if (ledger.totals.overduePaise > 0) {
      overdue.push({
        code: s.code,
        name: s.name,
        centre: s.batch.centre.name,
        batch: s.batch.name,
        overduePaise: ledger.totals.overduePaise,
        maxDaysOverdue: ledger.maxDaysOverdue,
        bucket: ledger.bucket,
        partPaid: ledger.lines.some((l) => l.status === "part_paid" && l.daysOverdue > 0),
      });
    }
  }

  const sortedRows = [...rows.values()].sort((a, b) => a.centre.localeCompare(b.centre) || a.batch.localeCompare(b.batch));
  overdue.sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue);
  return { rows: sortedRows, overdue, totals };
}

export async function listCentres() {
  return (await db.centre.findMany({ orderBy: { name: "asc" } })).map((c) => c.name);
}

import { computeInstalment, computeLedger, type InstalmentInput } from "@/lib/domain/ledger";
import { db, type Tx } from "./db";
import { today } from "./clock";

export const instalmentInclude = {
  discounts: { select: { label: true, amountPaise: true } },
  payments: { select: { id: true, amountPaise: true, paidAt: true, receiptNo: true, method: true, reference: true } },
} as const;

export const studentInclude = {
  batch: { include: { centre: true } },
  feePlan: { include: { instalments: { include: instalmentInclude, orderBy: { seq: "asc" } } } },
} as const;

type Row = InstalmentInput & { [k: string]: unknown };

export async function loadStudentLedger(code: string, at: Date = today()) {
  const student = await db.student.findUnique({ where: { code }, include: { ...studentInclude, parent: true } });
  if (!student) return null;
  const ledger = computeLedger((student.feePlan?.instalments ?? []) as Row[], at);
  return { student, ledger };
}

/** Recompute and persist an instalment's denormalised status. */
export async function refreshInstalmentStatus(tx: Tx, instalmentId: string, at: Date) {
  const inst = await tx.instalment.findUniqueOrThrow({ where: { id: instalmentId }, include: instalmentInclude });
  const line = computeInstalment(inst, at);
  if (line.status !== inst.status) {
    await tx.instalment.update({ where: { id: instalmentId }, data: { status: line.status } });
  }
  return line;
}

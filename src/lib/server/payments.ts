import { z } from "zod";
import { computeInstalment } from "@/lib/domain/ledger";
import { extractInstalmentCodes, matchPayment, type UnmatchedReason } from "@/lib/domain/matching";
import { db, type Tx } from "./db";
import { instalmentInclude, refreshInstalmentStatus } from "./ledger";
import { cancelPendingReminders, onInstalmentPaymentRecorded } from "./reminders";

export const incomingPaymentSchema = z.object({
  reference: z.string().trim().min(4).max(64).regex(/^[A-Za-z0-9\-_/]+$/, "Reference has invalid characters"),
  amountPaise: z.number().int().positive().max(100_000_000), // ≤ ₹10 lakh
  narration: z.string().trim().max(200),
  method: z.enum(["gateway_test", "bank"]),
  receivedAt: z.date(),
});

export type IncomingPaymentInput = z.infer<typeof incomingPaymentSchema>;

export type IngestResult =
  | { kind: "matched"; paymentId: string; receiptNo: string; instalmentCode: string; remindersCancelled: number }
  | { kind: "unmatched"; unmatchedId: string; reason: UnmatchedReason }
  | { kind: "duplicate"; paymentId?: string; unmatchedId?: string };

/** Indian financial year label for a date: 2026-11-02 → "2026-27". */
function fyLabel(d: Date) {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function nextReceiptNo(tx: Tx, at: Date) {
  const fy = fyLabel(at);
  const count = await tx.payment.count({ where: { receiptNo: { startsWith: `RC/${fy}/` } } });
  return `RC/${fy}/${String(count + 1).padStart(6, "0")}`;
}

async function recordPayment(
  tx: Tx,
  p: { instalmentId: string; amountPaise: number; reference: string; method: string; paidAt: Date },
) {
  const receiptNo = await nextReceiptNo(tx, p.paidAt);
  const payment = await tx.payment.create({ data: { ...p, receiptNo } });
  const line = await refreshInstalmentStatus(tx, p.instalmentId, p.paidAt);
  const remindersCancelled = await onInstalmentPaymentRecorded(tx, p.instalmentId, line.status, p.paidAt);
  return { payment, remindersCancelled };
}

/**
 * Single entry point for money arriving — gateway callback or bank credit.
 * Idempotent on `reference`. Never marks anything paid unless matchPayment()
 * finds exactly one open instalment the amount fits.
 */
export async function ingestPayment(raw: IncomingPaymentInput): Promise<IngestResult> {
  const input = incomingPaymentSchema.parse(raw);

  return db.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { reference: input.reference } });
    if (existing) return { kind: "duplicate", paymentId: existing.id };
    const existingUnmatched = await tx.unmatchedPayment.findUnique({ where: { reference: input.reference } });
    if (existingUnmatched) return { kind: "duplicate", unmatchedId: existingUnmatched.id };

    const candidates = new Map<string, { id: string; code: string; balancePaise: number }>();
    for (const code of extractInstalmentCodes(input.narration)) {
      const inst = await tx.instalment.findUnique({
        where: { code },
        include: { ...instalmentInclude, feePlan: { include: { student: true } } },
      });
      // A student who has left is handled by refunds, not by auto-matching.
      if (inst && inst.feePlan.student.status === "active") {
        candidates.set(code, { id: inst.id, code, balancePaise: computeInstalment(inst, input.receivedAt).balancePaise });
      }
    }

    const match = matchPayment(input, (code) => candidates.get(code));

    if (match.kind === "unmatched") {
      const u = await tx.unmatchedPayment.create({
        data: {
          reference: input.reference,
          amountPaise: input.amountPaise,
          receivedAt: input.receivedAt,
          payerNote: input.narration,
          reason: match.reason,
        },
      });
      return { kind: "unmatched", unmatchedId: u.id, reason: match.reason };
    }

    const { payment, remindersCancelled } = await recordPayment(tx, {
      instalmentId: match.instalmentId,
      amountPaise: input.amountPaise,
      reference: input.reference,
      method: input.method,
      paidAt: input.receivedAt,
    });
    return {
      kind: "matched",
      paymentId: payment.id,
      receiptNo: payment.receiptNo,
      instalmentCode: match.code,
      remindersCancelled,
    };
  });
}

export class AllocationError extends Error {}

/** Accounts staff tie a queued payment to an instalment — a human decision. */
export async function allocateUnmatched(opts: {
  unmatchedId: string;
  instalmentCode: string;
  userId: string;
  note: string;
  at: Date;
}) {
  return db.$transaction(async (tx) => {
    const u = await tx.unmatchedPayment.findUnique({ where: { id: opts.unmatchedId } });
    if (!u || u.status !== "open") throw new AllocationError("This payment has already been resolved.");

    const inst = await tx.instalment.findUnique({
      where: { code: opts.instalmentCode.trim().toUpperCase() },
      include: instalmentInclude,
    });
    if (!inst) throw new AllocationError(`No instalment with code ${opts.instalmentCode}.`);
    const line = computeInstalment(inst, opts.at);
    if (line.balancePaise === 0) throw new AllocationError(`${inst.code} is already fully paid.`);
    if (u.amountPaise > line.balancePaise) {
      throw new AllocationError(
        `Amount is more than the ${inst.code} balance. Reject it and refund the payer, or contact the parent.`,
      );
    }

    const { payment, remindersCancelled } = await recordPayment(tx, {
      instalmentId: inst.id,
      amountPaise: u.amountPaise,
      reference: u.reference,
      method: "manual_allocation",
      paidAt: u.receivedAt,
    });
    await tx.unmatchedPayment.update({
      where: { id: u.id },
      data: {
        status: "allocated",
        allocatedInstalmentId: inst.id,
        resolvedById: opts.userId,
        resolvedAt: opts.at,
        resolutionNote: opts.note || null,
      },
    });
    return { receiptNo: payment.receiptNo, remindersCancelled };
  });
}

export async function rejectUnmatched(opts: { unmatchedId: string; userId: string; note: string; at: Date }) {
  const res = await db.unmatchedPayment.updateMany({
    where: { id: opts.unmatchedId, status: "open" },
    data: { status: "rejected", resolvedById: opts.userId, resolvedAt: opts.at, resolutionNote: opts.note },
  });
  if (res.count === 0) throw new AllocationError("This payment has already been resolved.");
}

/** Student leaves: stop all reminders. Refund is computed separately. */
export async function markStudentLeft(code: string, leftOn: Date) {
  return db.$transaction(async (tx) => {
    const s = await tx.student.update({
      where: { code },
      data: { status: "left", leftOn },
      include: { feePlan: { include: { instalments: true } } },
    });
    let cancelled = 0;
    for (const i of s.feePlan?.instalments ?? []) {
      cancelled += await cancelPendingReminders(tx, i.id, "student_left", leftOn);
    }
    return cancelled;
  });
}

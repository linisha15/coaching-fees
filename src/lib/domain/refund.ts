// Pro-rata refund, per the institute's published policy.
//
// MoE 2024 coaching guidelines: refund the fee for the unused period, within
// 10 days of the student leaving. The policy adds a configurable % of that
// unused amount, tiered by weeks elapsed.
//
//   consumed = net course fee × weeksElapsed / weeksTotal
//   unused   = max(0, paid − consumed)
//   refund   = unused × tier%      (rounded down to the paisa)
//   pay by   = leftOn + payoutDays

import { z } from "zod";
import { addDays, daysBetween } from "./dates";

export const refundPolicySchema = z
  .object({
    payoutDays: z.number().int().min(1).max(10, "MoE 2024: refund must be paid within 10 days"),
    tiers: z
      .array(
        z.object({
          upToWeek: z.number().int().min(1).max(260),
          refundPercent: z.number().int().min(0).max(100),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine((p, ctx) => {
    for (let i = 1; i < p.tiers.length; i++) {
      if (p.tiers[i].upToWeek <= p.tiers[i - 1].upToWeek) {
        ctx.addIssue({ code: "custom", path: ["tiers", i, "upToWeek"], message: "Weeks must increase" });
      }
    }
  });

export type RefundPolicy = z.infer<typeof refundPolicySchema>;

export type RefundInput = {
  courseStart: Date;
  courseEnd: Date;
  leftOn: Date;
  /** Course fee after discounts, GST-inclusive. */
  netFeePaise: number;
  paidPaise: number;
  policy: RefundPolicy;
};

export type RefundLine = { label: string; amountPaise: number; note?: string };

export type RefundResult = {
  weeksTotal: number;
  weeksElapsed: number;
  consumedPaise: number;
  unusedPaise: number;
  /** Paid less than the fee for time attended (shown, never auto-billed). */
  shortfallPaise: number;
  refundPercent: number;
  appliedTier: { upToWeek: number; refundPercent: number } | null;
  refundPaise: number;
  payByDate: Date;
  lines: RefundLine[];
};

export function calculateRefund(input: RefundInput): RefundResult {
  const { courseStart, courseEnd, leftOn, netFeePaise, paidPaise } = input;
  const policy = refundPolicySchema.parse(input.policy);

  const courseDays = daysBetween(courseStart, courseEnd);
  if (courseDays <= 0) throw new Error("Course end must be after course start");
  if (netFeePaise < 0 || paidPaise < 0) throw new Error("Amounts must be non-negative");

  const weeksTotal = Math.ceil(courseDays / 7);
  // A started week counts as used. Leaving before the start uses 0 weeks.
  const daysAttended = Math.min(Math.max(daysBetween(courseStart, leftOn), 0), courseDays);
  const weeksElapsed = Math.min(Math.ceil(daysAttended / 7), weeksTotal);

  const consumedPaise = Math.round((netFeePaise * weeksElapsed) / weeksTotal);
  const unusedPaise = Math.max(0, paidPaise - consumedPaise);
  const shortfallPaise = Math.max(0, consumedPaise - paidPaise);

  const appliedTier = policy.tiers.find((t) => weeksElapsed <= t.upToWeek) ?? null;
  const refundPercent = appliedTier?.refundPercent ?? 0;
  const refundPaise = Math.floor((unusedPaise * refundPercent) / 100);
  const payByDate = addDays(leftOn, policy.payoutDays);

  const lines: RefundLine[] = [
    { label: "Course fee (after discounts, incl. GST)", amountPaise: netFeePaise },
    { label: "Paid so far", amountPaise: paidPaise },
    {
      label: "Fee for time attended",
      amountPaise: 0 - consumedPaise, // `0 -` avoids -0 (renders as "−₹0")
      note: `${weeksElapsed} of ${weeksTotal} weeks`,
    },
    { label: "Unused amount", amountPaise: unusedPaise },
    {
      label: `Refundable share (${refundPercent}%)`,
      amountPaise: refundPaise - unusedPaise,
      note: appliedTier
        ? `Policy tier: up to week ${appliedTier.upToWeek}`
        : `Beyond the last policy tier (week ${policy.tiers.at(-1)!.upToWeek})`,
    },
    { label: "Refund due", amountPaise: refundPaise },
  ];

  return {
    weeksTotal,
    weeksElapsed,
    consumedPaise,
    unusedPaise,
    shortfallPaise,
    refundPercent,
    appliedTier,
    refundPaise,
    payByDate,
    lines,
  };
}

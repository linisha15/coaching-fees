import { describe, expect, it } from "vitest";
import { parseISODate as d } from "./dates";
import { rupees } from "./money";
import { calculateRefund, refundPolicySchema, type RefundPolicy } from "./refund";

const POLICY: RefundPolicy = {
  payoutDays: 10,
  tiers: [
    { upToWeek: 4, refundPercent: 100 },
    { upToWeek: 12, refundPercent: 90 },
    { upToWeek: 24, refundPercent: 80 },
  ],
};

// 52-week (364-day) course
const base = {
  courseStart: d("2026-04-06"),
  courseEnd: d("2027-04-05"),
  netFeePaise: rupees(120000),
  policy: POLICY,
};

describe("calculateRefund", () => {
  it("full course paid, leaves after 10 weeks → 90% of unused", () => {
    const r = calculateRefund({ ...base, leftOn: d("2026-06-15"), paidPaise: rupees(120000) });
    expect(r.weeksTotal).toBe(52);
    expect(r.weeksElapsed).toBe(10);
    expect(r.consumedPaise).toBe(Math.round((rupees(120000) * 10) / 52)); // ₹23,076.92
    expect(r.unusedPaise).toBe(rupees(120000) - r.consumedPaise);
    expect(r.refundPercent).toBe(90);
    expect(r.refundPaise).toBe(Math.floor((r.unusedPaise * 90) / 100));
    expect(r.payByDate).toEqual(d("2026-06-25"));
  });

  it("a partly started week counts as a used week", () => {
    const r = calculateRefund({ ...base, leftOn: d("2026-04-08"), paidPaise: rupees(30000) });
    expect(r.weeksElapsed).toBe(1);
  });

  it("leaving before the course starts uses 0 weeks and refunds everything paid", () => {
    const r = calculateRefund({ ...base, leftOn: d("2026-04-01"), paidPaise: rupees(30000) });
    expect(r.weeksElapsed).toBe(0);
    expect(r.refundPaise).toBe(rupees(30000));
  });

  it("tier boundary is inclusive: week 4 → 100%, week 5 → 90%", () => {
    expect(calculateRefund({ ...base, leftOn: d("2026-05-04"), paidPaise: rupees(30000) }).refundPercent).toBe(100);
    expect(calculateRefund({ ...base, leftOn: d("2026-05-05"), paidPaise: rupees(30000) }).refundPercent).toBe(90);
  });

  it("beyond the last tier refunds 0%", () => {
    const r = calculateRefund({ ...base, leftOn: d("2026-12-01"), paidPaise: rupees(120000) });
    expect(r.appliedTier).toBeNull();
    expect(r.refundPaise).toBe(0);
  });

  it("paid less than time attended → no refund, shortfall shown", () => {
    // 1 instalment paid, leaves at week 20: consumed ₹46,153.85 > ₹30,000
    const r = calculateRefund({ ...base, leftOn: d("2026-08-20"), paidPaise: rupees(30000) });
    expect(r.unusedPaise).toBe(0);
    expect(r.refundPaise).toBe(0);
    expect(r.shortfallPaise).toBe(r.consumedPaise - rupees(30000));
  });

  it("breakdown lines reconcile to the refund", () => {
    const r = calculateRefund({ ...base, leftOn: d("2026-06-15"), paidPaise: rupees(60000) });
    const [, paid, consumed, unused, withheld, refund] = r.lines;
    expect(paid.amountPaise + consumed.amountPaise).toBe(unused.amountPaise);
    expect(unused.amountPaise + withheld.amountPaise).toBe(refund.amountPaise);
  });

  it("never emits negative zero in the breakdown", () => {
    const r = calculateRefund({ ...base, leftOn: d("2026-04-01"), paidPaise: rupees(30000) });
    expect(r.lines.every((l) => !Object.is(l.amountPaise, -0))).toBe(true);
  });

  it("caps elapsed weeks at the course length", () => {
    const r = calculateRefund({ ...base, leftOn: d("2027-06-01"), paidPaise: rupees(120000) });
    expect(r.weeksElapsed).toBe(52);
    expect(r.consumedPaise).toBe(rupees(120000));
  });
});

describe("refundPolicySchema", () => {
  it("rejects payout later than 10 days (MoE 2024)", () => {
    expect(refundPolicySchema.safeParse({ ...POLICY, payoutDays: 15 }).success).toBe(false);
  });
  it("rejects non-increasing tiers", () => {
    const bad = { ...POLICY, tiers: [{ upToWeek: 8, refundPercent: 100 }, { upToWeek: 4, refundPercent: 50 }] };
    expect(refundPolicySchema.safeParse(bad).success).toBe(false);
  });
  it("rejects percentages above 100", () => {
    expect(refundPolicySchema.safeParse({ ...POLICY, tiers: [{ upToWeek: 4, refundPercent: 120 }] }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { extractInstalmentCodes, matchPayment, type OpenInstalment } from "./matching";
import { gstBreakdown, rupees } from "./money";
import { scoreRisk } from "./risk";

const open: Record<string, OpenInstalment> = {
  "STU-0587-I1": { id: "i587", code: "STU-0587-I1", balancePaise: rupees(15000) },
  "STU-0412-I1": { id: "i412", code: "STU-0412-I1", balancePaise: 0 },
};
const lookup = (c: string) => open[c];
const pay = (narration: string, amount = 15000) => matchPayment({ reference: "UTR1", amountPaise: rupees(amount), narration }, lookup);

describe("matchPayment", () => {
  it("matches one known reference within balance", () => {
    expect(pay("NEFT/stu-0587-i1/ISHITA")).toMatchObject({ kind: "matched", instalmentId: "i587" });
  });
  it("matches a part payment", () => {
    expect(pay("STU-0587-I1", 5000).kind).toBe("matched");
  });
  it.each([
    ["Fees for Ishita", 15000, "no_reference"],
    ["STU-0587-I1 STU-0587-I2", 15000, "multiple_references"],
    ["STU-9999-I1", 15000, "unknown_reference"],
    ["STU-0412-I1", 30000, "already_paid"],
    ["STU-0587-I1", 20000, "exceeds_balance"],
    ["STU-0587-I1", 0, "invalid_amount"],
  ] as const)("%s ₹%i → unmatched (%s)", (narration, amount, reason) => {
    expect(pay(narration, amount)).toMatchObject({ kind: "unmatched", reason });
  });
  it("dedupes repeated codes", () => {
    expect(extractInstalmentCodes("STU-0587-I1 ref STU-0587-i1")).toEqual(["STU-0587-I1"]);
  });
});

describe("gstBreakdown", () => {
  it("splits ₹30,000 inclusive of 18% GST and sums back exactly", () => {
    const g = gstBreakdown(rupees(30000));
    expect(g.taxablePaise).toBe(2542373); // ₹25,423.73
    expect(g.taxablePaise + g.cgstPaise + g.sgstPaise).toBe(rupees(30000));
    expect(Math.abs(g.cgstPaise - g.sgstPaise)).toBeLessThanOrEqual(1);
  });
});

describe("scoreRisk", () => {
  it("flags missed fees + falling attendance + falling scores", () => {
    const r = scoreRisk({
      overdueInstalments: 1,
      attendancePercentsOldestFirst: [92, 90, 91, 89, 75, 70, 66, 60],
      testPercentsOldestFirst: [68, 70, 66, 64, 55, 50, 48, 45],
    });
    expect(r.signals.missedInstalments.points).toBe(20);
    expect(r.signals.attendance.drop).toBe(23);
    expect(r.signals.testScores.points).toBe(30);
    expect(r.score).toBe(80);
    expect(r.flagged).toBe(true);
  });
  it("does not flag a steady student with one late instalment", () => {
    const r = scoreRisk({
      overdueInstalments: 1,
      attendancePercentsOldestFirst: [90, 88, 91, 90, 89, 92, 90, 88],
      testPercentsOldestFirst: [70, 72, 71, 69, 73, 70, 72, 74],
    });
    expect(r.score).toBe(20);
    expect(r.flagged).toBe(false);
  });
  it("handles missing history without flagging", () => {
    const r = scoreRisk({ overdueInstalments: 0, attendancePercentsOldestFirst: [], testPercentsOldestFirst: [80] });
    expect(r.signals.attendance.recentAvg).toBeNull();
    expect(r.score).toBe(0);
  });
});

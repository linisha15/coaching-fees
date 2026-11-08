import { describe, expect, it } from "vitest";
import { parseISODate as d } from "./dates";
import { ageingBucket, computeInstalment, computeLedger, type InstalmentInput } from "./ledger";
import { rupees } from "./money";

const TODAY = d("2026-11-02"); // demo clock — anchors the brief's sample rows

function inst(over: Partial<InstalmentInput> = {}): InstalmentInput {
  return {
    id: "i1",
    code: "STU-0001-I1",
    seq: 1,
    dueDate: d("2026-10-10"),
    amountPaise: rupees(30000),
    discounts: [],
    payments: [],
    ...over,
  };
}

describe("brief sample rows", () => {
  it("STU-0412 Aarav: paid in full", () => {
    const l = computeInstalment(
      inst({ payments: [{ amountPaise: rupees(30000), paidAt: d("2026-10-08") }] }),
      TODAY,
    );
    expect(l.status).toBe("paid");
    expect(l.balancePaise).toBe(0);
    expect(l.daysOverdue).toBe(0);
    expect(l.bucket).toBe("not_due");
  });

  it("STU-0587 Ishita: part paid, 23 days overdue", () => {
    const l = computeInstalment(
      inst({ payments: [{ amountPaise: rupees(15000), paidAt: d("2026-10-12") }] }),
      TODAY,
    );
    expect(l.status).toBe("part_paid");
    expect(l.balancePaise).toBe(rupees(15000));
    expect(l.daysOverdue).toBe(23);
    expect(l.bucket).toBe("0-30");
  });

  it("STU-0219 Mohit: due in 13 days", () => {
    const l = computeInstalment(inst({ dueDate: d("2026-11-15"), amountPaise: rupees(40000) }), TODAY);
    expect(l.status).toBe("due");
    expect(l.daysUntilDue).toBe(13);
    expect(l.daysOverdue).toBe(0);
  });
});

describe("computeInstalment", () => {
  it("applies discounts before payments", () => {
    const l = computeInstalment(
      inst({
        discounts: [{ label: "Sibling", amountPaise: rupees(3000) }],
        payments: [{ amountPaise: rupees(27000), paidAt: d("2026-10-01") }],
      }),
      TODAY,
    );
    expect(l.netPaise).toBe(rupees(27000));
    expect(l.status).toBe("paid");
  });

  it("is not overdue on the due date itself", () => {
    expect(computeInstalment(inst({ dueDate: TODAY }), TODAY).daysOverdue).toBe(0);
  });

  it("rejects discounts larger than the instalment", () => {
    expect(() =>
      computeInstalment(inst({ discounts: [{ label: "x", amountPaise: rupees(30001) }] }), TODAY),
    ).toThrow(/discounts exceed/);
  });

  it("treats a fully discounted instalment as paid", () => {
    const l = computeInstalment(inst({ discounts: [{ label: "Scholarship", amountPaise: rupees(30000) }] }), TODAY);
    expect(l.status).toBe("paid");
  });
});

describe("ageingBucket boundaries", () => {
  it.each([
    [0, "not_due"],
    [1, "0-30"],
    [30, "0-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "60+"],
  ] as const)("%i days → %s", (days, bucket) => expect(ageingBucket(days)).toBe(bucket));
});

describe("computeLedger", () => {
  it("totals a part-paid plan and picks the oldest unpaid as next", () => {
    const ledger = computeLedger(
      [
        inst({ id: "a", seq: 1, dueDate: d("2026-07-10"), payments: [{ amountPaise: rupees(30000), paidAt: d("2026-07-09") }] }),
        inst({ id: "b", seq: 2, dueDate: d("2026-10-10"), payments: [{ amountPaise: rupees(15000), paidAt: d("2026-10-12") }] }),
        inst({ id: "c", seq: 3, dueDate: d("2027-01-10") }),
        inst({ id: "d", seq: 4, dueDate: d("2027-04-10") }),
      ],
      TODAY,
    );
    expect(ledger.totals.netPaise).toBe(rupees(120000));
    expect(ledger.totals.paidPaise).toBe(rupees(45000));
    expect(ledger.totals.balancePaise).toBe(rupees(75000));
    expect(ledger.totals.overduePaise).toBe(rupees(15000));
    expect(ledger.maxDaysOverdue).toBe(23);
    expect(ledger.next?.id).toBe("b");
  });

  it("has no next instalment when everything is paid", () => {
    const ledger = computeLedger(
      [inst({ payments: [{ amountPaise: rupees(30000), paidAt: d("2026-10-01") }] })],
      TODAY,
    );
    expect(ledger.next).toBeNull();
    expect(ledger.bucket).toBe("not_due");
  });
});

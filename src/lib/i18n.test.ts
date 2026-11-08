import { describe, expect, it } from "vitest";
import { parseISODate } from "./domain/dates";
import { formatDate } from "./i18n";
import { renderReminder } from "./reminder-messages";

describe("formatDate (IST calendar day)", () => {
  it("formats date-only values unchanged", () => {
    expect(formatDate(parseISODate("2026-10-10"))).toBe("10 Oct 2026");
    expect(formatDate(parseISODate("2026-10-10"), "hi")).toBe("10 अक्टू 2026");
  });

  it("a payment at 01:00 IST on 2 Nov shows 2 Nov, not 1 Nov (regression)", () => {
    const paidAt = new Date("2026-11-01T19:30:00Z"); // = 2 Nov 01:00 IST
    expect(formatDate(paidAt)).toBe("2 Nov 2026");
  });
});

describe("renderReminder", () => {
  const base = { studentName: "Ishita", seq: 3, balancePaise: 1_500_000, dueDate: parseISODate("2026-10-10"), payUrl: "https://x/pay/STU-0587-I3" };
  it("English overdue reminder quotes the remaining balance", () => {
    expect(renderReminder("en", { ...base, kind: "after", daysOverdue: 7 })).toBe(
      "₹15,000 for Ishita (instalment 3) is 7 days overdue. Pay: https://x/pay/STU-0587-I3",
    );
  });
  it("Hindi before-due reminder", () => {
    expect(renderReminder("hi", { ...base, kind: "before", daysOverdue: 0 })).toContain("10 अक्टू को देय हैं");
  });
});

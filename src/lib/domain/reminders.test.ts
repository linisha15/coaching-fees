import { describe, expect, it } from "vitest";
import { addDays, parseISODate as d } from "./dates";
import {
  decideTick,
  InvalidTransitionError,
  planReminders,
  remindersToCancelOnPayment,
  transition,
  type ReminderRow,
} from "./reminders";

const DUE = d("2026-11-15");

describe("transition", () => {
  it("scheduled → sent", () => {
    expect(transition({ status: "scheduled" }, { type: "SEND", at: DUE })).toEqual({ status: "sent", sentAt: DUE });
  });

  it("scheduled → cancelled with reason", () => {
    expect(transition({ status: "scheduled" }, { type: "CANCEL", at: DUE, reason: "paid" })).toMatchObject({
      status: "cancelled",
      cancelReason: "paid",
    });
  });

  it.each(["sent", "cancelled"] as const)("%s is terminal", (status) => {
    expect(() => transition({ status }, { type: "SEND", at: DUE })).toThrow(InvalidTransitionError);
    expect(() => transition({ status }, { type: "CANCEL", at: DUE, reason: "paid" })).toThrow(InvalidTransitionError);
  });
});

describe("planReminders", () => {
  it("schedules before / on / after the due date", () => {
    const plan = planReminders(DUE, d("2026-11-01"));
    expect(plan.map((p) => [p.kind, p.offsetDays])).toEqual([
      ["before", -3],
      ["on", 0],
      ["after", 3],
      ["after", 7],
    ]);
    expect(plan[0].scheduledFor).toEqual(d("2026-11-12"));
  });

  it("skips slots already in the past", () => {
    const plan = planReminders(DUE, d("2026-11-16"));
    expect(plan.map((p) => p.offsetDays)).toEqual([3, 7]);
  });
});

/**
 * Simulates the scheduler + payment events against an in-memory store using
 * only the domain functions. This is the brief's success metric:
 * "reminders go out on their own and stop the moment someone pays".
 */
function simulator(dueDate: Date, createdOn: Date) {
  let status: "due" | "part_paid" | "paid" = "due";
  const rows: (ReminderRow & { kind: string; reason?: string })[] = planReminders(dueDate, createdOn).map((p, i) => ({
    id: `r${i}`,
    instalmentId: "inst",
    kind: p.kind,
    scheduledFor: p.scheduledFor,
    status: "scheduled",
  }));
  const sent: string[] = [];

  function apply(id: string, event: Parameters<typeof transition>[1]) {
    const row = rows.find((r) => r.id === id)!;
    const next = transition(row, event);
    row.status = next.status;
    row.reason = next.cancelReason;
  }

  return {
    rows,
    sent,
    tick(today: Date) {
      const decision = decideTick(rows, () => status, today);
      decision.send.forEach((id) => {
        apply(id, { type: "SEND", at: today });
        sent.push(id);
      });
      decision.cancel.forEach((c) => apply(c.id, { type: "CANCEL", at: today, reason: c.reason }));
    },
    pay(newStatus: "part_paid" | "paid", at: Date) {
      status = newStatus;
      remindersToCancelOnPayment(status, rows).forEach((id) => apply(id, { type: "CANCEL", at, reason: "paid" }));
    },
  };
}

describe("reminder lifecycle", () => {
  it("sends each reminder exactly once when nobody pays", () => {
    const sim = simulator(DUE, d("2026-11-01"));
    for (let day = d("2026-11-01"); day <= d("2026-11-30"); day = addDays(day, 1)) sim.tick(day);
    expect(sim.sent).toEqual(["r0", "r1", "r2", "r3"]);
    expect(sim.rows.every((r) => r.status === "sent")).toBe(true);
  });

  it("payment cancels every pending reminder for that instalment immediately", () => {
    const sim = simulator(DUE, d("2026-11-01"));
    for (let day = d("2026-11-01"); day <= d("2026-11-13"); day = addDays(day, 1)) sim.tick(day);
    expect(sim.sent).toEqual(["r0"]); // the "before" reminder on 12 Nov

    sim.pay("paid", d("2026-11-13"));
    expect(sim.rows.filter((r) => r.status === "scheduled")).toHaveLength(0);
    expect(sim.rows.filter((r) => r.status === "cancelled").every((r) => r.reason === "paid")).toBe(true);

    for (let day = d("2026-11-14"); day <= d("2026-11-30"); day = addDays(day, 1)) sim.tick(day);
    expect(sim.sent).toEqual(["r0"]); // nothing more went out
  });

  it("a part payment does NOT stop reminders", () => {
    const sim = simulator(DUE, d("2026-11-01"));
    sim.pay("part_paid", d("2026-11-10"));
    expect(sim.rows.every((r) => r.status === "scheduled")).toBe(true);
    for (let day = d("2026-11-10"); day <= d("2026-11-30"); day = addDays(day, 1)) sim.tick(day);
    expect(sim.sent).toHaveLength(4);
  });

  it("paying after the due date stops the remaining after-reminders", () => {
    const sim = simulator(DUE, d("2026-11-01"));
    for (let day = d("2026-11-01"); day <= d("2026-11-19"); day = addDays(day, 1)) sim.tick(day);
    expect(sim.sent).toEqual(["r0", "r1", "r2"]);
    sim.pay("paid", d("2026-11-19"));
    sim.tick(d("2026-11-22"));
    expect(sim.sent).toEqual(["r0", "r1", "r2"]);
    expect(sim.rows.find((r) => r.id === "r3")!.status).toBe("cancelled");
  });

  it("a scheduler outage sends only the latest due reminder, not a burst", () => {
    const sim = simulator(DUE, d("2026-11-01"));
    sim.tick(d("2026-11-19")); // first run after downtime: before, on, +3 all due
    expect(sim.sent).toEqual(["r2"]);
    expect(sim.rows.filter((r) => r.reason === "superseded").map((r) => r.id)).toEqual(["r0", "r1"]);
  });

  it("defensively cancels a due reminder if the instalment is already paid", () => {
    const rows: ReminderRow[] = [{ id: "x", instalmentId: "i", scheduledFor: DUE, status: "scheduled" }];
    expect(decideTick(rows, () => "paid", DUE)).toEqual({ send: [], cancel: [{ id: "x", reason: "paid" }] });
  });

  it("ticking twice on the same day is idempotent", () => {
    const sim = simulator(DUE, d("2026-11-01"));
    sim.tick(DUE);
    sim.tick(DUE);
    expect(sim.sent).toEqual(["r1"]);
  });
});

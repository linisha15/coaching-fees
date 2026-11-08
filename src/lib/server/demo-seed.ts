/**
 * Demo data: 4 Jaipur centres, 8 batches, 20 students (incl. the 3 rows from the
 * brief), across every ageing bucket, part-paid, discounts, a student who
 * left, and 3 unmatched payments.
 *
 * History is REPLAYED day by day from April to DEMO_TODAY through the real
 * payment + reminder services, so reminder states are produced by the same
 * state machine the app uses, not hand-written.
 */
import { addDays, parseISODate as d, toISODate } from "@/lib/domain/dates";
import { rupees } from "@/lib/domain/money";
import { planReminders } from "@/lib/domain/reminders";
import { db } from "./db";
import { ingestPayment, markStudentLeft } from "./payments";
import { runReminderTick } from "./reminders";
import { evaluateRisk } from "./risk";

// ---------- fee schedules per batch ----------
type Schedule = { course: "JEE" | "NEET"; start: string; end: string; dues: string[]; amount: number };
const SCHEDULES: Record<string, Schedule> = {
  "JEE-A": { course: "JEE", start: "2026-04-06", end: "2027-04-04", dues: ["2026-04-10", "2026-07-10", "2026-10-10", "2027-01-10"], amount: 30000 },
  "JEE-B": { course: "JEE", start: "2026-06-22", end: "2027-06-20", dues: ["2026-06-25", "2026-09-25", "2026-12-25", "2027-03-25"], amount: 30000 },
  "NEET-A": { course: "NEET", start: "2026-07-06", end: "2027-05-02", dues: ["2026-07-15", "2026-11-15", "2027-03-15"], amount: 40000 },
  "NEET-B": { course: "NEET", start: "2026-05-25", end: "2027-03-21", dues: ["2026-06-01", "2026-10-01", "2027-02-01"], amount: 40000 },
};

const CENTRES: Record<string, [string, keyof typeof SCHEDULES][]> = {
  "Malviya Nagar": [["JEE 2027 Morning", "JEE-A"], ["JEE 2027 Evening", "JEE-A"], ["NEET 2027 Morning", "NEET-A"]],
  "Vaishali Nagar": [["JEE 2027 Morning", "JEE-A"], ["NEET 2027 Evening", "NEET-B"]],
  Mansarovar: [["JEE 2027 Evening", "JEE-B"], ["NEET 2027 Morning", "NEET-A"]],
  "Raja Park": [["JEE 2027 Morning", "JEE-A"], ["NEET 2027 Morning", "NEET-A"]],
};

// ---------- students ----------
type Trend = "steady" | "mild_drop" | "sharp_drop";
type Pay = { seq: number; amount?: number; on?: string; via?: "gateway" | "bank" };
type S = {
  code: string;
  name: string;
  centre: string;
  batch: string;
  parent: string;
  phone: string;
  lang: "en" | "hi";
  pays: Pay[];
  discount?: { label: string; perInstalment: number };
  attendance?: Trend;
  scores?: Trend;
  leftOn?: string;
};

const full = (...seqs: number[]): Pay[] => seqs.map((seq) => ({ seq }));

const STUDENTS: S[] = [
  // --- the three rows from the brief ---
  { code: "STU-0412", name: "Aarav Meena", centre: "Malviya Nagar", batch: "JEE 2027 Morning", parent: "Suresh Meena", phone: "919829010001", lang: "hi",
    pays: [...full(1, 2), { seq: 3, on: "2026-10-08" }] },
  { code: "STU-0587", name: "Ishita Sharma", centre: "Malviya Nagar", batch: "JEE 2027 Evening", parent: "Anita Sharma", phone: "919829010002", lang: "hi",
    pays: [...full(1, 2), { seq: 3, amount: 15000, on: "2026-10-12", via: "bank" }], attendance: "mild_drop" },
  { code: "STU-0219", name: "Mohit Gurjar", centre: "Malviya Nagar", batch: "NEET 2027 Morning", parent: "Ramkishan Gurjar", phone: "919829010003", lang: "hi",
    pays: full(1) },
  // --- additional ---
  { code: "STU-0301", name: "Priya Choudhary", centre: "Malviya Nagar", batch: "JEE 2027 Morning", parent: "Ramesh Choudhary", phone: "919829010004", lang: "en",
    pays: full(1, 2, 3), discount: { label: "Sibling concession", perInstalment: 1500 } },
  { code: "STU-0455", name: "Rohan Saini", centre: "Malviya Nagar", batch: "NEET 2027 Morning", parent: "Kamla Saini", phone: "919829010005", lang: "en",
    pays: full(1), discount: { label: "Merit scholarship 10%", perInstalment: 4000 } },
  { code: "STU-0477", name: "Ira Sethi", centre: "Malviya Nagar", batch: "JEE 2027 Evening", parent: "Neha Sethi", phone: "919829010006", lang: "en",
    pays: [1, 2, 3, 4].map((seq) => ({ seq, on: "2026-04-08" })) },
  { code: "STU-0623", name: "Kavya Agarwal", centre: "Vaishali Nagar", batch: "JEE 2027 Morning", parent: "Manoj Agarwal", phone: "919829010007", lang: "hi",
    pays: full(1, 2), attendance: "sharp_drop", scores: "sharp_drop" },
  { code: "STU-0634", name: "Arjun Rathore", centre: "Vaishali Nagar", batch: "JEE 2027 Morning", parent: "Vikram Singh Rathore", phone: "919829010008", lang: "hi",
    pays: full(1), attendance: "mild_drop" },
  { code: "STU-0668", name: "Yash Purohit", centre: "Vaishali Nagar", batch: "JEE 2027 Morning", parent: "Deepak Purohit", phone: "919829010009", lang: "en",
    pays: full(1, 2) },
  { code: "STU-0702", name: "Sneha Jangid", centre: "Vaishali Nagar", batch: "NEET 2027 Evening", parent: "Lalita Jangid", phone: "919829010010", lang: "hi",
    pays: [{ seq: 1, amount: 20000, on: "2026-06-03" }] },
  { code: "STU-0715", name: "Vikram Choudhary", centre: "Vaishali Nagar", batch: "NEET 2027 Evening", parent: "Ramesh Choudhary", phone: "919829010004", lang: "en",
    pays: full(1, 2) },
  { code: "STU-0957", name: "Meera Gupta", centre: "Vaishali Nagar", batch: "NEET 2027 Evening", parent: "Alok Gupta", phone: "919829010011", lang: "en",
    pays: [{ seq: 1 }, { seq: 2, amount: 25000, on: "2026-10-05" }] },
  { code: "STU-0812", name: "Dev Kumawat", centre: "Mansarovar", batch: "JEE 2027 Evening", parent: "Shankar Kumawat", phone: "919829010012", lang: "hi",
    pays: full(1) },
  { code: "STU-0826", name: "Riya Khandelwal", centre: "Mansarovar", batch: "JEE 2027 Evening", parent: "Pooja Khandelwal", phone: "919829010013", lang: "en",
    pays: full(1, 2), scores: "sharp_drop" },
  { code: "STU-0839", name: "Harsh Yadav", centre: "Mansarovar", batch: "NEET 2027 Morning", parent: "Mahesh Yadav", phone: "919829010014", lang: "hi",
    pays: [{ seq: 1, on: "2026-07-13" }, { seq: 2, on: "2026-10-01" }], leftOn: "2026-10-20" },
  { code: "STU-0850", name: "Pooja Saini", centre: "Mansarovar", batch: "NEET 2027 Morning", parent: "Rakesh Saini", phone: "919829010015", lang: "en",
    pays: [{ seq: 1, on: "2026-07-14", via: "bank" }] },
  { code: "STU-0905", name: "Tanvi Mathur", centre: "Raja Park", batch: "JEE 2027 Morning", parent: "Sanjay Mathur", phone: "919829010016", lang: "hi",
    pays: full(1, 2) },
  { code: "STU-0918", name: "Kabir Bansal", centre: "Raja Park", batch: "JEE 2027 Morning", parent: "Ritu Bansal", phone: "919829010017", lang: "en",
    pays: [...full(1, 2), { seq: 3, on: "2026-10-15", via: "bank" }] },
  { code: "STU-0931", name: "Nisha Meena", centre: "Raja Park", batch: "NEET 2027 Morning", parent: "Gopal Meena", phone: "919829010018", lang: "hi",
    pays: [], attendance: "sharp_drop" },
  { code: "STU-0944", name: "Aditya Sharma", centre: "Raja Park", batch: "NEET 2027 Morning", parent: "Vinod Sharma", phone: "919829010019", lang: "en",
    pays: full(1) },
];

/** Payments that arrive without a usable reference → accounts queue. */
const UNMATCHED_EVENTS = [
  { on: "2026-10-14", reference: "UTR2026101400871", amount: 30000, narration: "NEFT fees tanvi mathur oct" },
  { on: "2026-10-29", reference: "UTR2026102900412", amount: 35000, narration: "IMPS STU-0668-I3 YASH PUROHIT" },
  { on: "2026-10-30", reference: "UPI-604522118833", amount: 15000, narration: "UPI/STU-1234-I2/RAJESH K" },
];

// ---------- deterministic pseudo-random ----------
let rngState = 42; // reset at the start of every seed run → identical data each time
const rand = () => ((rngState = (rngState * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const jitter = (n: number) => Math.round((rand() - 0.5) * 2 * n);

function series(trend: Trend, base: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const late = i >= count / 2;
    const drop = trend === "steady" || !late ? 0 : trend === "mild_drop" ? 11 : 24;
    return Math.max(20, Math.min(100, base - drop + jitter(3)));
  });
}

/** Removes all demo data. Users and their sessions are kept (updated in place
 *  below), so whoever presses "Reset demo data" stays signed in. */
async function wipe() {
  await db.messageLog.deleteMany();
  await db.reminder.deleteMany();
  await db.counsellorTask.deleteMany();
  await db.dropoutFlag.deleteMany();
  await db.payment.deleteMany();
  await db.discount.deleteMany();
  await db.unmatchedPayment.deleteMany();
  await db.instalment.deleteMany();
  await db.feePlan.deleteMany();
  await db.attendanceWeek.deleteMany();
  await db.testScore.deleteMany();
  await db.student.deleteMany();
  await db.batch.deleteMany();
  await db.centre.deleteMany();
  await db.otpChallenge.deleteMany();
  await db.refundTier.deleteMany();
  await db.refundPolicy.deleteMany();
}

export type SeedSummary = {
  asOf: string;
  students: number;
  payments: number;
  unmatched: number;
  remindersSent: number;
  flags: number;
};

/** The reset button is shown only on demo deployments (ALLOW_DEMO_RESET=true). */
export function demoResetAllowed(): boolean {
  return process.env.ALLOW_DEMO_RESET === "true";
}

let running: Promise<SeedSummary> | null = null;

/** Wipe and rebuild the demo data as of `today`. Concurrent calls share one run. */
export function seedDemo(today: Date): Promise<SeedSummary> {
  running ??= build(today).finally(() => (running = null));
  return running;
}

async function build(TODAY: Date): Promise<SeedSummary> {
  rngState = 42;
  await wipe();

  await db.user.upsert({
    where: { phone: "919800000001" },
    update: { name: "Sunita Verma", role: "accounts", language: "en", consentAt: null },
    create: { phone: "919800000001", name: "Sunita Verma", role: "accounts", language: "en" },
  });

  await db.refundPolicy.create({
    data: {
      version: 1,
      active: true,
      payoutDays: 10,
      publishedAt: d("2026-03-15"),
      notes: "Refund of the unused fee, pro-rata by weeks attended, paid within 10 days of the student leaving (MoE 2024 coaching guidelines).",
      tiers: {
        create: [
          { upToWeek: 4, refundPercent: 100 },
          { upToWeek: 12, refundPercent: 90 },
          { upToWeek: 24, refundPercent: 80 },
        ],
      },
    },
  });

  const batchIds = new Map<string, { id: string; schedule: Schedule }>();
  for (const [centreName, batches] of Object.entries(CENTRES)) {
    const centre = await db.centre.create({ data: { name: centreName } });
    for (const [name, key] of batches) {
      const s = SCHEDULES[key];
      const b = await db.batch.create({
        data: { name, course: s.course, centreId: centre.id, startDate: d(s.start), endDate: d(s.end) },
      });
      batchIds.set(`${centreName}|${name}`, { id: b.id, schedule: s });
    }
  }

  type Event = { on: Date; run: () => Promise<unknown> };
  const events: Event[] = [];
  let txn = 1000;

  for (const s of STUDENTS) {
    const parent = await db.user.upsert({
      where: { phone: s.phone },
      // Reset language and consent too, so the consent screen shows again.
      update: { name: s.parent, role: "parent", language: s.lang, consentAt: null },
      create: { phone: s.phone, name: s.parent, role: "parent", language: s.lang },
    });
    const batch = batchIds.get(`${s.centre}|${s.batch}`);
    if (!batch) throw new Error(`Unknown batch ${s.centre}|${s.batch}`);
    const sch = batch.schedule;

    const student = await db.student.create({
      data: { code: s.code, name: s.name, batchId: batch.id, parentId: parent.id },
    });

    const enrolledOn = addDays(d(sch.start), -7);
    const plan = await db.feePlan.create({
      data: {
        studentId: student.id,
        name: `${sch.course} 2027 · ${sch.dues.length} instalments`,
        totalPaise: rupees(sch.amount * sch.dues.length),
      },
    });

    for (const [i, due] of sch.dues.entries()) {
      const seq = i + 1;
      const code = `${s.code}-I${seq}`;
      const inst = await db.instalment.create({
        data: { code, feePlanId: plan.id, seq, dueDate: d(due), amountPaise: rupees(sch.amount) },
      });
      if (s.discount) {
        await db.discount.create({
          data: { instalmentId: inst.id, label: s.discount.label, amountPaise: rupees(s.discount.perInstalment) },
        });
      }
      await db.reminder.createMany({
        data: planReminders(d(due), enrolledOn).map((p) => ({ instalmentId: inst.id, ...p })),
      });

      const pay = s.pays.find((p) => p.seq === seq);
      if (pay) {
        const net = sch.amount - (s.discount?.perInstalment ?? 0);
        const on = pay.on ? d(pay.on) : addDays(d(due), -2);
        const via = pay.via ?? "gateway";
        const reference = via === "bank" ? `UTR${toISODate(on).replaceAll("-", "")}${txn++}` : `pay_test_${txn++}`;
        events.push({
          on,
          run: () =>
            ingestPayment({
              reference,
              amountPaise: rupees(pay.amount ?? net),
              narration: via === "bank" ? `NEFT ${code} ${s.parent.toUpperCase()}` : code,
              method: via === "bank" ? "bank" : "gateway_test",
              receivedAt: new Date(on.getTime() + 5 * 3_600_000), // 10:30 IST
            }),
        });
      }
    }

    if (s.leftOn) events.push({ on: d(s.leftOn), run: () => markStudentLeft(s.code, d(s.leftOn!)) });

    // 8 weeks of attendance and 8 tests (bulk upload is out of scope; seeded).
    const att = series(s.attendance ?? "steady", 86 + jitter(5), 8);
    await db.attendanceWeek.createMany({
      data: att.map((percent, i) => ({ studentId: student.id, weekStart: addDays(d("2026-09-07"), 7 * i), percent })),
    });
    const sc = series(s.scores ?? "steady", 64 + jitter(8), 8);
    await db.testScore.createMany({
      data: sc.map((percent, i) => ({
        studentId: student.id,
        testName: `Unit Test ${i + 1}`,
        testDate: addDays(d("2026-07-19"), 14 * i),
        percent,
      })),
    });
  }

  for (const u of UNMATCHED_EVENTS) {
    events.push({
      on: d(u.on),
      run: () =>
        ingestPayment({
          reference: u.reference,
          amountPaise: rupees(u.amount),
          narration: u.narration,
          method: "bank",
          receivedAt: new Date(d(u.on).getTime() + 6 * 3_600_000),
        }),
    });
  }

  // ---------- replay ----------
  events.sort((a, b) => a.on.getTime() - b.on.getTime());
  let sent = 0;
  for (let day = d("2026-03-30"); day <= TODAY; day = addDays(day, 1)) {
    while (events.length && events[0].on.getTime() === day.getTime()) await events.shift()!.run();
    sent += (await runReminderTick(day)).sent;
  }
  if (events.length) throw new Error(`${events.length} events after DEMO_TODAY were not replayed`);

  const risk = await evaluateRisk(TODAY);

  // One flag already reviewed by a counsellor and marked false, to show the loop.
  const nisha = await db.student.findUniqueOrThrow({ where: { code: "STU-0931" }, include: { flags: true } });
  const flag = nisha.flags[0];
  if (flag) {
    await db.dropoutFlag.update({
      where: { id: flag.id },
      data: {
        status: "false_flag",
        reviewedAt: TODAY,
        reviewNote: "Spoke to father. Nisha was down with dengue for 3 weeks; back in class and fees will be paid this week.",
      },
    });
    await db.counsellorTask.updateMany({ where: { flagId: flag.id }, data: { status: "done" } });
  }

  return {
    asOf: toISODate(TODAY),
    students: await db.student.count(),
    payments: await db.payment.count(),
    unmatched: await db.unmatchedPayment.count(),
    remindersSent: sent,
    flags: risk.created,
  };
}

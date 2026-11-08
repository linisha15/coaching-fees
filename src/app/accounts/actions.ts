"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseISODate } from "@/lib/domain/dates";
import { refundPolicySchema } from "@/lib/domain/refund";
import { UNMATCHED_REASON_TEXT } from "@/lib/domain/matching";
import { requireUser } from "@/lib/server/auth";
import { nowOnClock, today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { demoResetAllowed, seedDemo } from "@/lib/server/demo-seed";
import { AllocationError, allocateUnmatched, ingestPayment, markStudentLeft, rejectUnmatched } from "@/lib/server/payments";
import { runReminderTick } from "@/lib/server/reminders";
import { evaluateRisk } from "@/lib/server/risk";

export type ActionResult = { ok?: string; error?: string };

// Every action re-checks the role: pages being protected is not enough.

export async function runRemindersAction(): Promise<ActionResult> {
  await requireUser("accounts");
  const r = await runReminderTick(today());
  revalidatePath("/accounts", "layout");
  return {
    ok:
      r.sent + r.cancelled === 0
        ? "Nothing due today. All reminders up to date."
        : `Sent ${r.sent} reminder${r.sent === 1 ? "" : "s"}${r.cancelled ? `, cancelled ${r.cancelled}` : ""}.`,
  };
}

const bankCreditSchema = z.object({
  reference: z.string().trim().min(4, "Reference (UTR) is required").max(64),
  amount: z.coerce.number().positive("Amount must be more than 0").max(1_000_000, "Amount looks too large"),
  narration: z.string().trim().max(200),
});

/** Simulates a bank statement line arriving — runs the real matcher. */
export async function recordBankCreditAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser("accounts");
  const parsed = bankCreditSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const amountPaise = Math.round(parsed.data.amount * 100);
  try {
    const res = await ingestPayment({
      reference: parsed.data.reference.replace(/\s+/g, ""),
      amountPaise,
      narration: parsed.data.narration,
      method: "bank",
      receivedAt: nowOnClock(),
    });
    revalidatePath("/accounts", "layout");
    if (res.kind === "matched")
      return { ok: `Matched to ${res.instalmentCode}. Receipt ${res.receiptNo}. ${res.remindersCancelled} pending reminder(s) cancelled.` };
    if (res.kind === "unmatched") return { ok: `Not matched (${UNMATCHED_REASON_TEXT[res.reason]}). Added to the queue below.` };
    return { error: "This reference was already received. Nothing was recorded twice." };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0].message };
    throw e;
  }
}

export async function allocateAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("accounts");
  const instalmentCode = String(form.get("instalmentCode") ?? "").trim();
  if (!/^STU-\d{4}-I\d{1,2}$/i.test(instalmentCode)) return { error: "Enter an instalment code like STU-0905-I3" };
  let msg: string;
  try {
    const r = await allocateUnmatched({
      unmatchedId: String(form.get("id")),
      instalmentCode,
      userId: user.id,
      note: String(form.get("note") ?? "").slice(0, 200),
      at: nowOnClock(),
    });
    msg = `Applied to ${instalmentCode.toUpperCase()}. Receipt ${r.receiptNo}.${r.remindersCancelled ? ` ${r.remindersCancelled} reminder(s) cancelled.` : ""}`;
  } catch (e) {
    if (e instanceof AllocationError) return { error: e.message };
    throw e;
  }
  // The item leaves the queue, taking its inline message with it — confirm at page level.
  revalidatePath("/accounts", "layout");
  redirect(`/accounts/payments?ok=${encodeURIComponent(msg)}`);
}

export async function rejectAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("accounts");
  const note = String(form.get("note") ?? "").trim();
  if (note.length < 3) return { error: "Add a short note (e.g. refunded to payer)" };
  try {
    await rejectUnmatched({ unmatchedId: String(form.get("id")), userId: user.id, note: note.slice(0, 200), at: nowOnClock() });
  } catch (e) {
    if (e instanceof AllocationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/accounts", "layout");
  redirect(`/accounts/payments?ok=${encodeURIComponent("Payment rejected. Remember to refund the payer.")}`);
}

export async function markLeftAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser("accounts");
  const code = String(form.get("code") ?? "");
  let leftOn: Date;
  try {
    leftOn = parseISODate(String(form.get("leftOn") ?? ""));
  } catch {
    return { error: "Enter a valid leaving date" };
  }
  if (leftOn > today()) return { error: "Leaving date can't be in the future" };
  const student = await db.student.findUnique({ where: { code } });
  if (!student) return { error: "Student not found" };
  if (student.status === "left") return { error: "Already marked as left" };
  const cancelled = await markStudentLeft(code, leftOn);
  revalidatePath("/accounts", "layout");
  return { ok: `Marked as left. ${cancelled} pending reminder(s) cancelled.` };
}

export async function publishPolicyAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser("accounts");
  const weeks = form.getAll("upToWeek").map(String);
  const pcts = form.getAll("refundPercent").map(String);
  const tiers = weeks
    .map((w, i) => ({ w: w.trim(), p: (pcts[i] ?? "").trim() }))
    .filter((r) => r.w !== "" || r.p !== "")
    .map((r) => ({ upToWeek: Number(r.w), refundPercent: Number(r.p) }));
  const parsed = refundPolicySchema.safeParse({ payoutDays: Number(form.get("payoutDays")), tiers });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `${i.path.join(" ")}: ${i.message}`.replace(/^tiers (\d+)/, (_, n) => `Row ${Number(n) + 1}`) };
  }
  const notes = String(form.get("notes") ?? "").trim().slice(0, 500);

  await db.$transaction(async (tx) => {
    const last = await tx.refundPolicy.findFirst({ orderBy: { version: "desc" } });
    await tx.refundPolicy.updateMany({ data: { active: false } });
    await tx.refundPolicy.create({
      data: {
        version: (last?.version ?? 0) + 1,
        active: true,
        payoutDays: parsed.data.payoutDays,
        publishedAt: today(),
        notes: notes || last?.notes || "",
        tiers: { create: parsed.data.tiers },
      },
    });
  });
  revalidatePath("/accounts/refunds");
  revalidatePath("/policy");
  return { ok: "New policy version published. Parents see it on the refund policy page." };
}

/** Wipes and rebuilds the demo data. Only when ALLOW_DEMO_RESET=true. */
export async function resetDemoAction(): Promise<ActionResult> {
  await requireUser("accounts");
  if (!demoResetAllowed()) return { error: "Demo reset is turned off on this deployment." };
  const s = await seedDemo(today());
  revalidatePath("/", "layout");
  redirect(
    `/accounts?ok=${encodeURIComponent(`Demo data reset to ${s.asOf}: ${s.students} students, ${s.payments} payments, ${s.unmatched} unmatched.`)}`,
  );
}

export async function evaluateRiskAction(): Promise<ActionResult> {
  await requireUser("accounts");
  const r = await evaluateRisk(today());
  revalidatePath("/accounts", "layout");
  return { ok: `Scored ${r.evaluated} students. ${r.created} new flag(s).` };
}

export async function reviewFlagAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser("accounts");
  const id = String(form.get("id"));
  const decision = form.get("decision");
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (decision !== "false_flag" && decision !== "actioned") return { error: "Unknown action" };
  if (decision === "false_flag" && note.length < 3) return { error: "Say briefly why this is a false flag" };

  const res = await db.$transaction(async (tx) => {
    const r = await tx.dropoutFlag.updateMany({
      where: { id, status: "open" },
      data: { status: decision, reviewNote: note || null, reviewedAt: today() },
    });
    if (r.count) await tx.counsellorTask.updateMany({ where: { flagId: id }, data: { status: "done" } });
    return r.count;
  });
  if (!res) return { error: "This flag was already reviewed." };
  revalidatePath("/accounts", "layout");
  redirect(`/accounts/risk?ok=${encodeURIComponent(decision === "false_flag" ? "Marked as a false flag." : "Call logged. Task closed.")}`);
}

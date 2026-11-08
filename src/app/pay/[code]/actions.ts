"use server";

import { redirect } from "next/navigation";
import { computeInstalment } from "@/lib/domain/ledger";
import { t } from "@/lib/i18n";
import { findOwnInstalment, requireUser } from "@/lib/server/auth";
import { nowOnClock, today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { getLang } from "@/lib/server/lang";
import { instalmentInclude } from "@/lib/server/ledger";
import { ingestPayment } from "@/lib/server/payments";

export type PayState = { error?: string };

const REF = /^pay_test_[a-z0-9]{16}$/;

/**
 * Mock gateway (test mode). A real gateway would call our webhook; here the
 * "success" button does what that webhook does: ingestPayment(), which is the
 * same matched/unmatched path bank credits take.
 */
export async function payAction(_prev: PayState, form: FormData): Promise<PayState> {
  const user = await requireUser("parent");
  const s = t(await getLang(user));
  const code = String(form.get("code") ?? "");
  const reference = String(form.get("ref") ?? "");
  if (!REF.test(reference)) return { error: s.common.error };

  const owned = await findOwnInstalment(user.id, code);
  if (!owned) return { error: s.common.error };

  if (form.get("outcome") === "fail") return { error: s.pay.failed };

  const inst = await db.instalment.findUniqueOrThrow({ where: { id: owned.id }, include: instalmentInclude });
  const line = computeInstalment(inst, today());
  if (line.balancePaise === 0) return { error: s.pay.alreadyPaid };

  const res = await ingestPayment({
    reference,
    amountPaise: line.balancePaise,
    narration: code,
    method: "gateway_test",
    receivedAt: nowOnClock(),
  });

  if (res.kind === "matched") redirect(`/receipt/${res.paymentId}?new=1`);
  if (res.kind === "duplicate" && res.paymentId) redirect(`/receipt/${res.paymentId}`);
  // Should not happen for a link we generated, but never mark paid on a guess.
  return {
    error:
      "We received the payment but could not match it automatically. The accounts team will apply it within 1 working day.",
  };
}

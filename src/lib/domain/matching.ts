// Payment matching. Auto-apply a payment ONLY when it maps to exactly one
// open instalment and does not exceed its balance. Everything else goes to
// the accounts review queue — nothing is ever marked paid on a guess.

export type UnmatchedReason =
  | "invalid_amount"
  | "no_reference"
  | "multiple_references"
  | "unknown_reference"
  | "already_paid"
  | "exceeds_balance";

export const UNMATCHED_REASON_TEXT: Record<UnmatchedReason, string> = {
  invalid_amount: "Amount is zero or invalid",
  no_reference: "No instalment reference in the payment note",
  multiple_references: "More than one instalment reference",
  unknown_reference: "Reference does not match any instalment",
  already_paid: "Instalment is already fully paid",
  exceeds_balance: "Amount is more than the balance due",
};

export type IncomingPayment = {
  reference: string; // gateway txn id / bank UTR (idempotency key)
  amountPaise: number;
  narration: string; // free text from the bank / gateway order id
};

export type OpenInstalment = { id: string; code: string; balancePaise: number };

export type MatchResult =
  | { kind: "matched"; instalmentId: string; code: string }
  | { kind: "unmatched"; reason: UnmatchedReason; codes: string[] };

const CODE_PATTERN = /STU-\d{4}-I\d{1,2}/gi;

export function extractInstalmentCodes(text: string): string[] {
  return [...new Set((text.match(CODE_PATTERN) ?? []).map((c) => c.toUpperCase()))];
}

export function matchPayment(
  p: IncomingPayment,
  lookup: (code: string) => OpenInstalment | undefined,
): MatchResult {
  const codes = extractInstalmentCodes(p.narration);
  const unmatched = (reason: UnmatchedReason): MatchResult => ({ kind: "unmatched", reason, codes });

  if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) return unmatched("invalid_amount");
  if (codes.length === 0) return unmatched("no_reference");
  if (codes.length > 1) return unmatched("multiple_references");

  const inst = lookup(codes[0]);
  if (!inst) return unmatched("unknown_reference");
  if (inst.balancePaise <= 0) return unmatched("already_paid");
  if (p.amountPaise > inst.balancePaise) return unmatched("exceeds_balance");

  return { kind: "matched", instalmentId: inst.id, code: inst.code };
}

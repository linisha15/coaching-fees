import { istToday, toISODate } from "@/lib/domain/dates";
import { gstBreakdown } from "@/lib/domain/money";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const csv = (v: string | number) => {
  const s = String(v);
  // Quote, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
};
const rupees = (paise: number) => (paise / 100).toFixed(2);

/**
 * Receipt vouchers for Tally import (CSV). Stub-level: column layout matches a
 * typical Tally receipt-voucher import template; a real integration would
 * emit Tally XML for the client's exact ledger names.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "accounts") return new Response("Not allowed", { status: 403 });

  const centre = new URL(req.url).searchParams.get("centre") ?? undefined;
  const payments = await db.payment.findMany({
    where: centre ? { instalment: { feePlan: { student: { batch: { centre: { name: centre } } } } } } : {},
    include: { instalment: { include: { feePlan: { include: { student: { include: { batch: { include: { centre: true } } } } } } } } },
    orderBy: { paidAt: "asc" },
  });

  const header = ["Date", "Voucher Type", "Voucher No", "Party Ledger", "Centre", "Batch", "Instalment", "Taxable Value", "CGST", "SGST", "Amount", "Mode", "Reference"];
  const lines = payments.map((p) => {
    const s = p.instalment.feePlan.student;
    const g = gstBreakdown(p.amountPaise, p.instalment.feePlan.gstRateBps);
    return [
      toISODate(istToday(p.paidAt)), "Receipt", p.receiptNo, `${s.name} (${s.code})`, s.batch.centre.name, s.batch.name,
      p.instalment.code, rupees(g.taxablePaise), rupees(g.cgstPaise), rupees(g.sgstPaise), rupees(p.amountPaise), p.method, p.reference,
    ].map(csv).join(",");
  });

  return new Response([header.map(csv).join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tally-receipts${centre ? `-${centre.replaceAll(" ", "-")}` : ""}.csv"`,
    },
  });
}

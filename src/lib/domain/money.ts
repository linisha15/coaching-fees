// Money is always integer paise. Convert to rupees only for display.

export function rupees(n: number): number {
  return Math.round(n * 100);
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

export type GstBreakdown = {
  grossPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  rateBps: number;
};

/**
 * Split a GST-inclusive amount into taxable value + CGST + SGST
 * (intra-state supply: Rajasthan → Rajasthan). Parts always sum to gross.
 */
export function gstBreakdown(grossPaise: number, rateBps = 1800): GstBreakdown {
  const taxablePaise = Math.round((grossPaise * 10_000) / (10_000 + rateBps));
  const tax = grossPaise - taxablePaise;
  const cgstPaise = Math.floor(tax / 2);
  return { grossPaise, taxablePaise, cgstPaise, sgstPaise: tax - cgstPaise, rateBps };
}

import { formatINR } from "@/lib/domain/money";
import type { BucketAmounts } from "@/lib/server/dashboard";

const BUCKETS = [
  { key: "0-30", label: "0–30 days", color: "var(--age-1)" },
  { key: "31-60", label: "31–60 days", color: "var(--age-2)" },
  { key: "60+", label: "60+ days", color: "var(--age-3)" },
] as const;

export function AgeingLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground" aria-label="Ageing buckets">
      {BUCKETS.map((b) => (
        <li key={b.key} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
          {b.label}
        </li>
      ))}
    </ul>
  );
}

/** Thin segmented bar: overdue split by age. Numbers live in the table beside it. */
export function AgeingBar({ buckets, max }: { buckets: BucketAmounts; max: number }) {
  const total = buckets["0-30"] + buckets["31-60"] + buckets["60+"];
  if (total === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex h-2 items-stretch gap-[2px]" style={{ width: `${Math.max(8, (total / max) * 100)}%` }}>
      {BUCKETS.map((b) =>
        buckets[b.key] > 0 ? (
          <span
            key={b.key}
            title={`${b.label}: ${formatINR(buckets[b.key])}`}
            className="rounded-full"
            style={{ flexGrow: buckets[b.key], background: b.color }}
          />
        ) : null,
      )}
    </div>
  );
}

export const AGE_BUCKETS = BUCKETS;

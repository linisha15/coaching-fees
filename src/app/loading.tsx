/** Neutral fallback while the session is checked (shared by parent and accounts). */
export default function Loading() {
  return (
    <div className="flex flex-1 items-start justify-center pt-24" aria-busy="true">
      <p className="animate-pulse text-base text-muted-foreground">Loading… · लोड हो रहा है…</p>
    </div>
  );
}

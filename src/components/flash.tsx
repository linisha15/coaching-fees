/** Page-level confirmation passed as ?ok=… after an action that removes its own form. */
export function Flash({ message }: { message?: string | string[] }) {
  const text = typeof message === "string" ? message.slice(0, 200) : null;
  if (!text) return null;
  return (
    <p role="status" className="rounded-lg border border-[var(--good)]/30 px-4 py-3 text-sm text-[var(--good)]">
      ✓ {text}
    </p>
  );
}

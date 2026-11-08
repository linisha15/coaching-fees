"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Calls the one LLM route. Failure leaves the template in place and says why. */
export function AiDraftButton({ flagId, hasAi }: { flagId: string; hasAi: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: false });

  async function run() {
    setState({ loading: true });
    try {
      const res = await fetch(`/api/risk/${flagId}/explain`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not write a draft right now.");
      setState({ loading: false });
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Could not write a draft right now." });
    }
  }

  return (
    <div className="mt-3">
      <Button variant="ghost" size="sm" onClick={run} disabled={state.loading} aria-busy={state.loading} className="-ml-2.5">
        {state.loading ? "Writing draft…" : hasAi ? "Rewrite AI draft" : "Write AI draft"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-[var(--critical)]">
          {state.error}
        </p>
      )}
    </div>
  );
}

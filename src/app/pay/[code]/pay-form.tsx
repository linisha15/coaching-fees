"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { payAction, type PayState } from "./actions";

export function PayForm({ code, reference, labels }: { code: string; reference: string; labels: { pay: string; fail: string } }) {
  const [state, action] = useActionState<PayState, FormData>(payAction, {});
  return (
    <form action={action} className="mt-10 flex flex-col gap-2">
      {/* Fixed per page render: a double submit is idempotent, never a double charge. */}
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="ref" value={reference} />
      {state.error && (
        <p role="alert" className="mb-4 rounded-lg border border-[var(--critical)]/30 px-4 py-3 text-base text-[var(--critical)]">
          {state.error}
        </p>
      )}
      <SubmitButton name="outcome" value="success" className="h-14 text-lg" pendingLabel="…">
        {labels.pay}
      </SubmitButton>
      <SubmitButton name="outcome" value="fail" variant="ghost" className="h-12 text-base text-muted-foreground" pendingLabel="…">
        {labels.fail}
      </SubmitButton>
    </form>
  );
}

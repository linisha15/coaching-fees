"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "./actions";

/** Destructive, so it asks first. Takes ~15–30 s: the seed replays Apr→Nov. */
export function ResetDemoButton({ action }: { action: () => Promise<ActionResult> }) {
  const [state, formAction] = useActionState(async () => action(), {} as ActionResult);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Reset all demo data to its original state? Payments, reminders and flags changed by anyone will be undone.")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col items-end"
    >
      <SubmitButton variant="ghost" className="h-9 text-muted-foreground" pendingLabel="Resetting… (about 20 s)">
        Reset demo data
      </SubmitButton>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-[var(--critical)]">
          {state.error}
        </p>
      )}
    </form>
  );
}

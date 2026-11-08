"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/app/accounts/actions";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
};

/** A form that shows its own success / error message inline. */
export function ActionForm({ action, children, className }: Props) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      {(state.ok || state.error) && (
        <p
          role={state.error ? "alert" : "status"}
          className={cn("mt-2 text-sm", state.error ? "text-[var(--critical)]" : "text-[var(--good)]")}
        >
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}

/** For actions that take no input. */
export function ActionButtonForm({
  action,
  children,
  className,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ActionForm action={async () => action()} className={className}>
      {children}
    </ActionForm>
  );
}

"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<typeof Button> & { pendingLabel?: string };

/** Disables itself while the form submits, so a double tap can't double-pay. */
export function SubmitButton({ children, pendingLabel, className, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={cn(className)} {...props}>
      {pending ? (pendingLabel ?? "…") : children}
    </Button>
  );
}

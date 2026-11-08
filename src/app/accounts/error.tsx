"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AccountsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="rounded-xl border p-8">
      <h1 className="text-lg font-semibold">This page couldn’t load</h1>
      <p className="mt-1 text-sm text-muted-foreground">No data was changed. {error.digest && `Ref: ${error.digest}`}</p>
      <Button onClick={reset} className="mt-4 h-9">
        Try again
      </Button>
    </div>
  );
}

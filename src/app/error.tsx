"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-lg text-muted-foreground">कुछ गड़बड़ हो गई। Please try again.</p>
      {error.digest && <p className="mt-2 text-xs text-muted-foreground">Ref: {error.digest}</p>}
      <Button onClick={reset} className="mt-8 h-12 text-base">
        Try again · फिर से कोशिश करें
      </Button>
    </div>
  );
}

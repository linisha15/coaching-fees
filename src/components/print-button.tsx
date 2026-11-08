"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" className="no-print mt-6 h-12 text-base" onClick={() => window.print()}>
      {label}
    </Button>
  );
}

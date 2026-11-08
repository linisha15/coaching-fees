"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AccountsNav({ counts }: { counts: { queue: number; flags: number } }) {
  const path = usePathname();
  const items = [
    { href: "/accounts", label: "Dues", match: (p: string) => p === "/accounts" || p.startsWith("/accounts/students") },
    { href: "/accounts/payments", label: "Unmatched", count: counts.queue },
    { href: "/accounts/refunds", label: "Refunds" },
    { href: "/accounts/risk", label: "Risk flags", count: counts.flags },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm">
      {items.map((i) => {
        const active = i.match ? i.match(path) : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {i.label}
            {!!i.count && (
              <span className="rounded-full bg-foreground px-1.5 text-xs font-medium tabular-nums text-background">{i.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

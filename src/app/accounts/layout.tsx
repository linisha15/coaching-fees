import { signOutAction } from "@/app/actions";
import { requireUser } from "@/lib/server/auth";
import { isDemoClock, today } from "@/lib/server/clock";
import { db } from "@/lib/server/db";
import { formatDate } from "@/lib/i18n";
import { AccountsNav } from "./nav";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

export default async function AccountsLayout({ children }: LayoutProps<"/accounts">) {
  const user = await requireUser("accounts");
  const [queue, flags] = await Promise.all([
    db.unmatchedPayment.count({ where: { status: "open" } }),
    db.dropoutFlag.count({ where: { status: "open" } }),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
          <span className="font-semibold tracking-tight">Fees · Accounts</span>
          <AccountsNav counts={{ queue, flags }} />
          <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
            {isDemoClock() ? (
              <span
                className="rounded-full border px-2.5 py-0.5"
                title="The app's clock is pinned by DEMO_TODAY in .env so the brief's sample data reads as stated. Overdue days, reminders and refund deadlines are calculated from this date. Remove DEMO_TODAY to use the real date."
              >
                Demo date: {formatDate(today())}
              </span>
            ) : (
              <span>Today: {formatDate(today())}</span>
            )}
            <span className="hidden sm:inline">
              Signed in as <span className="text-foreground">{user.name}</span> (Accounts)
            </span>
            <form action={signOutAction}>
              <button type="submit" className="underline-offset-4 hover:text-foreground hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

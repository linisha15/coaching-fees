import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { LangToggle } from "@/components/lang-toggle";
import { t, type Lang } from "@/lib/i18n";

/** Narrow single-column frame for parent screens — built for small phones. */
export function ParentShell({ lang, children, back }: { lang: Lang; children: React.ReactNode; back?: string }) {
  const s = t(lang);
  return (
    <div lang={lang} className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-16 pt-5">
      <header className="no-print mb-8 flex items-center justify-between">
        {back ? (
          <Link href={back} className="-ml-2 rounded-md px-2 py-1 text-base text-muted-foreground hover:text-foreground">
            ← {s.common.back}
          </Link>
        ) : (
          <span className="text-base font-semibold tracking-tight">{s.appName}</span>
        )}
        <div className="flex items-center gap-1">
          <LangToggle lang={lang} />
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {s.common.signOut}
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

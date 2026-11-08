import { redirect } from "next/navigation";
import { consentAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { t } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/server/auth";
import { getLang } from "@/lib/server/lang";
import { LangToggle } from "@/components/lang-toggle";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

export default async function ConsentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "parent" || user.consentAt) redirect("/");
  const lang = await getLang(user);
  const s = t(lang).consent;

  return (
    <div lang={lang} className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-16 pt-5">
      <div className="mb-16 flex justify-end">
        <LangToggle lang={lang} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{s.title}</h1>
      <p className="mt-6 text-lg leading-relaxed">{s.body}</p>
      <form action={consentAction} className="mt-10 flex flex-col gap-6">
        <label className="flex items-start gap-3 text-lg">
          <input type="checkbox" name="agree" required className="mt-1.5 size-5 accent-[var(--primary)]" />
          <span>{s.agree}</span>
        </label>
        <SubmitButton className="h-14 text-lg">{s.continue}</SubmitButton>
      </form>
    </div>
  );
}

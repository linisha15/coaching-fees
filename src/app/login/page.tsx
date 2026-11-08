import { redirect } from "next/navigation";
import { LangToggle } from "@/components/lang-toggle";
import { t } from "@/lib/i18n";
import { getCurrentUser, mockOtpCode } from "@/lib/server/auth";
import { getLang } from "@/lib/server/lang";
import { LoginForm } from "./login-form";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const lang = await getLang();
  const s = t(lang).login;

  return (
    <div lang={lang} className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-16 pt-5">
      <div className="mb-16 flex justify-end">
        <LangToggle lang={lang} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{s.title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{s.subtitle}</p>
      <LoginForm
        labels={{
          phone: s.phone,
          sendCode: s.sendCode,
          code: s.code,
          codeSent: s.codeSent,
          verify: s.verify,
          changeNumber: s.changeNumber,
          devHint: mockOtpCode() ? s.devHint : null,
        }}
      />
      <p className="mt-auto pt-16 text-sm text-muted-foreground">
        Demo numbers — parent: 98290 10002 (Ishita) · 98290 10003 (Mohit) · 98290 10004 (two children) · accounts: 98000 00001
      </p>
    </div>
  );
}

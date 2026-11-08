"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isLang } from "@/lib/i18n";
import { getCurrentUser, otpSchema, phoneSchema, requestOtp, signOut, verifyOtp } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { LANG_COOKIE } from "@/lib/server/lang";

export type LoginState =
  | { step: "phone"; error?: string; phone?: string }
  | { step: "code"; phone: string; error?: string };

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const intent = form.get("intent");

  if (intent === "change") return { step: "phone", phone: prev.step === "code" ? prev.phone.slice(2) : undefined };

  if (intent === "send") {
    const raw = String(form.get("phone") ?? "");
    const parsed = phoneSchema.safeParse(raw);
    if (!parsed.success) return { step: "phone", phone: raw, error: parsed.error.issues[0].message };
    const res = await requestOtp(parsed.data);
    if (!res.ok) return { step: "phone", phone: raw, error: res.error };
    return { step: "code", phone: parsed.data };
  }

  if (intent === "verify" && prev.step === "code") {
    const code = otpSchema.safeParse(String(form.get("code") ?? ""));
    if (!code.success) return { ...prev, error: code.error.issues[0].message };
    const res = await verifyOtp(prev.phone, code.data);
    if (!res.ok) return { ...prev, error: res.error };
    redirect(res.role === "accounts" ? "/accounts" : "/parent");
  }

  return { step: "phone" };
}

export async function consentAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "parent" && !user.consentAt) {
    await db.user.update({ where: { id: user.id }, data: { consentAt: new Date() } });
  }
  redirect("/parent");
}

export async function setLanguageAction(form: FormData) {
  const lang = form.get("lang");
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { language: lang } });
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

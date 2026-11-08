import { cookies } from "next/headers";
import { isLang, type Lang } from "@/lib/i18n";

export const LANG_COOKIE = "lang";

/** Language for the current viewer: user's saved preference, else cookie, else English. */
export async function getLang(user?: { language: string } | null): Promise<Lang> {
  if (user && isLang(user.language)) return user.language;
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : "en";
}

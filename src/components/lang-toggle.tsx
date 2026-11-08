import { setLanguageAction } from "@/app/actions";
import { t, type Lang } from "@/lib/i18n";

export function LangToggle({ lang }: { lang: Lang }) {
  return (
    <form action={setLanguageAction}>
      <input type="hidden" name="lang" value={lang === "hi" ? "en" : "hi"} />
      <button
        type="submit"
        className="rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t(lang).common.language}
      </button>
    </form>
  );
}

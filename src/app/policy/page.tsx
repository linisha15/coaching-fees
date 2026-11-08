import Link from "next/link";
import { LangToggle } from "@/components/lang-toggle";
import { formatDate } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/server/auth";
import { getLang } from "@/lib/server/lang";
import { loadActivePolicy } from "@/lib/server/policy";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

/** Published refund policy (MoE 2024 requires it to be public). No login needed. */
export default async function PolicyPage() {
  const user = await getCurrentUser();
  const lang = await getLang(user);
  const policy = await loadActivePolicy();
  const hi = lang === "hi";

  return (
    <div lang={lang} className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-16 pt-5">
      <div className="mb-10 flex items-center justify-between">
        <Link href="/" className="-ml-2 rounded-md px-2 py-1 text-base text-muted-foreground hover:text-foreground">
          ← {hi ? "वापस" : "Back"}
        </Link>
        <LangToggle lang={lang} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{hi ? "रिफंड नीति" : "Refund policy"}</h1>

      {!policy ? (
        <p className="mt-6 text-lg text-muted-foreground">
          {hi ? "नीति अभी प्रकाशित नहीं हुई है।" : "The policy has not been published yet."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-base text-muted-foreground">
            {hi ? "संस्करण" : "Version"} {policy.version} · {formatDate(policy.publishedAt, lang)}
          </p>
          <p className="mt-8 text-lg leading-relaxed">
            {hi
              ? "यदि छात्र कोर्स बीच में छोड़ता है, तो जमा की गई फीस में से उपस्थित हफ़्तों की फीस घटाकर बची हुई राशि का नीचे दिया गया प्रतिशत लौटाया जाएगा।"
              : "If a student leaves mid-course, we refund the fee paid for the weeks not yet attended, at the percentage below."}
          </p>
          <table className="mt-8 w-full text-lg">
            <thead>
              <tr className="border-b text-left text-base text-muted-foreground">
                <th className="py-2 font-normal">{hi ? "कोर्स छोड़ने का समय" : "Leaving in"}</th>
                <th className="py-2 text-right font-normal">{hi ? "रिफंड" : "Refund"}</th>
              </tr>
            </thead>
            <tbody>
              {policy.tiers.map((tier, i) => {
                const from = i === 0 ? 1 : policy.tiers[i - 1].upToWeek + 1;
                return (
                  <tr key={tier.id} className="border-b">
                    <td className="py-3">
                      {hi ? `हफ़्ता ${from}–${tier.upToWeek}` : `Week ${from}–${tier.upToWeek}`}
                    </td>
                    <td className="py-3 text-right tabular-nums">{tier.refundPercent}%</td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-3">
                  {hi ? `हफ़्ता ${policy.tiers.at(-1)!.upToWeek + 1} के बाद` : `After week ${policy.tiers.at(-1)!.upToWeek}`}
                </td>
                <td className="py-3 text-right tabular-nums">0%</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-8 text-lg leading-relaxed">
            {hi
              ? `रिफंड छात्र के कोर्स छोड़ने के ${policy.payoutDays} दिन के भीतर दिया जाएगा।`
              : `Refunds are paid within ${policy.payoutDays} days of the student leaving.`}
          </p>
        </>
      )}
    </div>
  );
}

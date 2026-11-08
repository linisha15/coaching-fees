// Hindi + English strings for parent-facing screens and reminder messages.

import { istToday } from "./domain/dates";

export type Lang = "en" | "hi";
export const LANGS: Lang[] = ["en", "hi"];
export const isLang = (x: unknown): x is Lang => x === "en" || x === "hi";

const en = {
  appName: "Fees",
  login: {
    title: "Sign in",
    subtitle: "Enter the mobile number registered with the institute.",
    phone: "Mobile number",
    sendCode: "Send code",
    code: "6-digit code",
    codeSent: "We sent a code to",
    verify: "Verify and continue",
    changeNumber: "Change number",
    devHint: "Demo: the code is 123456",
  },
  consent: {
    title: "Your consent",
    body: "Your child is a minor. To show their fees, receipts and progress, we need your consent as parent or guardian to process their data. We use it only for fee records and academic updates, and never share it for marketing.",
    agree: "I am the parent or guardian and I consent",
    continue: "Continue",
  },
  dues: {
    title: "Fees",
    due: "Due",
    dueOn: "Due on",
    overdueBy: (n: number) => `${n} ${n === 1 ? "day" : "days"} overdue`,
    dueIn: (n: number) => (n === 0 ? "Due today" : `Due in ${n} ${n === 1 ? "day" : "days"}`),
    pay: "Pay",
    allPaid: "All fees paid. Thank you.",
    noStudents: "No students are linked to this number. Please contact the centre office.",
    paidSoFar: "Paid so far",
    viewAll: "All instalments and receipts",
    partPaid: (paid: string) => `${paid} already paid`,
  },
  schedule: {
    title: "Instalments",
    instalment: (n: number) => `Instalment ${n}`,
    paid: "Paid",
    partPaid: "Part paid",
    upcoming: "Upcoming",
    overdue: "Overdue",
    receipts: "Receipts",
    noReceipts: "No payments yet.",
    receipt: "Receipt",
    discount: "Discount",
    refundPolicy: "Refund policy",
  },
  receipt: {
    title: "Payment receipt",
    receiptNo: "Receipt no.",
    date: "Date",
    student: "Student",
    towards: "Towards",
    taxable: "Taxable value",
    cgst: "CGST",
    sgst: "SGST",
    total: "Total paid",
    method: "Paid via",
    gstin: "GSTIN",
    sac: "SAC 999293 · Commercial training and coaching",
    print: "Print",
    back: "Back",
  },
  pay: {
    title: "Pay instalment",
    testMode: "Test mode — no real money moves",
    payNow: "Pay",
    fail: "Simulate failed payment",
    failed: "Payment failed. Nothing was charged. Please try again.",
    alreadyPaid: "This instalment is already paid.",
  },
  common: {
    signOut: "Sign out",
    language: "हिंदी",
    back: "Back",
    error: "Something went wrong. Please try again.",
    retry: "Try again",
    loading: "Loading…",
  },
};

type Dict = typeof en;

const hi: Dict = {
  appName: "फीस",
  login: {
    title: "साइन इन करें",
    subtitle: "संस्थान में दर्ज मोबाइल नंबर डालें।",
    phone: "मोबाइल नंबर",
    sendCode: "कोड भेजें",
    code: "6 अंकों का कोड",
    codeSent: "कोड भेजा गया",
    verify: "पुष्टि करें",
    changeNumber: "नंबर बदलें",
    devHint: "डेमो: कोड 123456 है",
  },
  consent: {
    title: "आपकी सहमति",
    body: "आपका बच्चा नाबालिग है। उसकी फीस, रसीदें और प्रगति दिखाने के लिए हमें माता-पिता या अभिभावक के रूप में आपकी सहमति चाहिए। हम इसका उपयोग केवल फीस रिकॉर्ड और पढ़ाई की जानकारी के लिए करते हैं, मार्केटिंग के लिए कभी साझा नहीं करते।",
    agree: "मैं माता-पिता या अभिभावक हूँ और सहमति देता/देती हूँ",
    continue: "आगे बढ़ें",
  },
  dues: {
    title: "फीस",
    due: "देय",
    dueOn: "अंतिम तिथि",
    overdueBy: (n: number) => `${n} दिन से बकाया`,
    dueIn: (n: number) => (n === 0 ? "आज देय" : `${n} दिन में देय`),
    pay: "भुगतान करें",
    allPaid: "सारी फीस जमा है। धन्यवाद।",
    noStudents: "इस नंबर से कोई छात्र जुड़ा नहीं है। कृपया सेंटर ऑफिस से संपर्क करें।",
    paidSoFar: "अब तक जमा",
    viewAll: "सभी किस्तें और रसीदें",
    partPaid: (paid: string) => `${paid} जमा हो चुके`,
  },
  schedule: {
    title: "किस्तें",
    instalment: (n: number) => `किस्त ${n}`,
    paid: "जमा",
    partPaid: "आंशिक जमा",
    upcoming: "आगामी",
    overdue: "बकाया",
    receipts: "रसीदें",
    noReceipts: "अभी तक कोई भुगतान नहीं।",
    receipt: "रसीद",
    discount: "छूट",
    refundPolicy: "रिफंड नीति",
  },
  receipt: {
    title: "भुगतान रसीद",
    receiptNo: "रसीद नं.",
    date: "तिथि",
    student: "छात्र",
    towards: "किस्त",
    taxable: "कर योग्य राशि",
    cgst: "CGST",
    sgst: "SGST",
    total: "कुल भुगतान",
    method: "भुगतान माध्यम",
    gstin: "GSTIN",
    sac: "SAC 999293 · वाणिज्यिक प्रशिक्षण और कोचिंग",
    print: "प्रिंट करें",
    back: "वापस",
  },
  pay: {
    title: "किस्त का भुगतान",
    testMode: "टेस्ट मोड — कोई असली पैसा नहीं कटेगा",
    payNow: "भुगतान करें",
    fail: "असफल भुगतान आज़माएँ",
    failed: "भुगतान असफल रहा। कोई पैसा नहीं कटा। कृपया फिर से कोशिश करें।",
    alreadyPaid: "यह किस्त पहले ही जमा हो चुकी है।",
  },
  common: {
    signOut: "साइन आउट",
    language: "English",
    back: "वापस",
    error: "कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।",
    retry: "फिर से कोशिश करें",
    loading: "लोड हो रहा है…",
  },
};

export function t(lang: Lang): Dict {
  return lang === "hi" ? hi : en;
}

const MONTHS_HI = ["जन", "फ़र", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अग", "सित", "अक्टू", "नव", "दिस"];

/**
 * "10 Oct 2026" / "10 अक्टू 2026", as the calendar day in India. Works for both
 * date-only values (00:00 UTC) and real timestamps (e.g. a 01:00 IST payment).
 */
export function formatDate(input: Date, lang: Lang = "en", withYear = true): string {
  const d = istToday(input);
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const month =
    lang === "hi"
      ? MONTHS_HI[d.getUTCMonth()]
      : d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
  return withYear ? `${day} ${month} ${year}` : `${day} ${month}`;
}

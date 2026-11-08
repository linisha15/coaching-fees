import Anthropic from "@anthropic-ai/sdk";
import { addDays } from "@/lib/domain/dates";
import { computeLedger } from "@/lib/domain/ledger";
import { scoreRisk, type RiskSignals } from "@/lib/domain/risk";
import { db } from "./db";
import { studentInclude } from "./ledger";

/** Score every active student; open a flag + counsellor call task for new risks. */
export async function evaluateRisk(at: Date) {
  const students = await db.student.findMany({
    where: { status: "active" },
    include: {
      ...studentInclude,
      attendance: { orderBy: { weekStart: "asc" } },
      scores: { orderBy: { testDate: "asc" } },
      flags: { where: { status: "open" } },
    },
  });

  let created = 0;
  for (const s of students) {
    const ledger = computeLedger(s.feePlan?.instalments ?? [], at);
    const result = scoreRisk({
      overdueInstalments: ledger.lines.filter((l) => l.daysOverdue > 0).length,
      attendancePercentsOldestFirst: s.attendance.map((a) => a.percent),
      testPercentsOldestFirst: s.scores.map((t) => t.percent),
    });
    if (!result.flagged || s.flags.length > 0) continue;

    // The flag's ONLY side effect: a counsellor call task. No fee action, no parent message.
    await db.$transaction(async (tx) => {
      const flag = await tx.dropoutFlag.create({
        data: {
          studentId: s.id,
          score: result.score,
          signals: JSON.stringify(result.signals),
          explanation: templateExplanation(s.name, result.signals),
          explanationSource: "template",
          createdAt: at,
        },
      });
      await tx.counsellorTask.create({
        data: { flagId: flag.id, studentId: s.id, dueBy: addDays(at, 2), createdAt: at },
      });
    });
    created++;
  }
  return { evaluated: students.length, created };
}

export function parseSignals(json: string): RiskSignals {
  return JSON.parse(json) as RiskSignals;
}

function templateExplanation(name: string, s: RiskSignals): string {
  const parts: string[] = [];
  if (s.missedInstalments.count > 0) parts.push(`${s.missedInstalments.count} instalment(s) overdue`);
  if (s.attendance.points > 0) parts.push(`attendance down from ${s.attendance.previousAvg}% to ${s.attendance.recentAvg}%`);
  if (s.testScores.points > 0) parts.push(`test scores down from ${s.testScores.previousAvg}% to ${s.testScores.recentAvg}%`);
  return `${name}: ${parts.join("; ")}. Suggested: call the parent, ask how the student is coping, and offer a meeting with the batch mentor. Do not discuss fee collection on this call.`;
}

export class ExplainError extends Error {}

/**
 * The single LLM call. Writes a counsellor-facing explanation + talking points
 * from the deterministic signals. Output is stored as an "AI draft"; it never
 * changes the score, touches fees, or messages a parent.
 */
export async function writeAiExplanation(flagId: string) {
  const flag = await db.dropoutFlag.findUnique({
    where: { id: flagId },
    include: { student: { include: { batch: { include: { centre: true } } } } },
  });
  if (!flag) throw new ExplainError("Flag not found");
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExplainError("AI drafting is not configured (ANTHROPIC_API_KEY missing). The template explanation is shown instead.");
  }

  const signals = parseSignals(flag.signals);
  const firstName = flag.student.name.split(" ")[0];
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You help a school counsellor at a coaching institute in Jaipur prepare for a supportive phone call with a parent. " +
      "Write in plain English, warm and non-judgemental. The student is a minor. Never suggest fee collection, penalties, or " +
      "pressure; never speculate about family finances, health or caste. Use only the facts given. Output: one short paragraph " +
      "explaining why the student was flagged, then 3 bullet talking points (open questions). Under 120 words. No headings.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          student_first_name: firstName,
          batch: flag.student.batch.name,
          risk_score: flag.score,
          signals,
        }),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new ExplainError("The AI declined to draft this. Use the template.");
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
  if (!text) throw new ExplainError("The AI returned an empty draft.");

  await db.dropoutFlag.update({ where: { id: flagId }, data: { explanation: text, explanationSource: "ai" } });
  return text;
}

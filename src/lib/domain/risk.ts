// Dropout-risk score. DETERMINISTIC — no model involved. The LLM only writes
// the counsellor-facing explanation of these signals, after the fact.

export type RiskSignals = {
  missedInstalments: { count: number; points: number };
  attendance: { previousAvg: number | null; recentAvg: number | null; drop: number; points: number };
  testScores: { previousAvg: number | null; recentAvg: number | null; drop: number; points: number };
};

export type RiskResult = { score: number; flagged: boolean; signals: RiskSignals };

export const RISK_THRESHOLD = 50;
const WINDOW = 4; // attendance weeks / tests per comparison window

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Points for a fall in a percentage metric: ≥15 pts → 30, ≥8 → 15. */
function dropPoints(drop: number): number {
  if (drop >= 15) return 30;
  if (drop >= 8) return 15;
  return 0;
}

/** Compares the latest WINDOW values with the WINDOW before them. */
function trend(valuesOldestFirst: number[]) {
  const recent = valuesOldestFirst.slice(-WINDOW);
  const previous = valuesOldestFirst.slice(-2 * WINDOW, -WINDOW);
  const recentAvg = avg(recent);
  const previousAvg = avg(previous);
  const drop = recentAvg !== null && previousAvg !== null ? Math.max(0, previousAvg - recentAvg) : 0;
  return { previousAvg, recentAvg, drop, points: dropPoints(drop) };
}

export function scoreRisk(input: {
  overdueInstalments: number;
  attendancePercentsOldestFirst: number[];
  testPercentsOldestFirst: number[];
}): RiskResult {
  const count = input.overdueInstalments;
  const signals: RiskSignals = {
    missedInstalments: { count, points: count >= 2 ? 40 : count === 1 ? 20 : 0 },
    attendance: trend(input.attendancePercentsOldestFirst),
    testScores: trend(input.testPercentsOldestFirst),
  };
  const score =
    signals.missedInstalments.points + signals.attendance.points + signals.testScores.points;
  return { score, flagged: score >= RISK_THRESHOLD, signals };
}

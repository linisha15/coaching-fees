import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { today } from "@/lib/server/clock";
import { runReminderTick } from "@/lib/server/reminders";

/**
 * Daily scheduler entry point (cron). Auth: `Authorization: Bearer $CRON_SECRET`.
 * Idempotent, so retries and double-fires are harmless.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const summary = await runReminderTick(today());
  return NextResponse.json(summary);
}

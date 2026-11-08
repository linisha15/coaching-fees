import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { ExplainError, writeAiExplanation } from "@/lib/server/risk";

/** The single LLM call in the app. Accounts/counsellor only. */
export async function POST(_req: Request, ctx: RouteContext<"/api/risk/[id]/explain">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "accounts") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/i.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  try {
    const text = await writeAiExplanation(id);
    return NextResponse.json({ explanation: text });
  } catch (e) {
    if (e instanceof ExplainError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "AI is busy. Try again in a minute." }, { status: 503 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "AI key is invalid. Template kept." }, { status: 503 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: "AI service error. Template kept." }, { status: 502 });
    console.error(e);
    return NextResponse.json({ error: "Could not write a draft. Template kept." }, { status: 500 });
  }
}

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "./db";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 7;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 5;
/** Fixed demo code: MOCK_OTP_CODE env, or 123456 in development. Never in a real deployment. */
export function mockOtpCode(): string | null {
  const c = process.env.MOCK_OTP_CODE;
  if (c && /^\d{6}$/.test(c)) return c;
  return process.env.NODE_ENV === "production" ? null : "123456";
}

export type Role = "parent" | "accounts";

/** Indian mobile: accepts "98290 12345", "+91 9829012345" → "919829012345". */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s\-()]/g, "").replace(/^\+/, ""))
  .transform((s) => (s.length === 10 ? `91${s}` : s))
  .pipe(z.string().regex(/^91[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"));

export const otpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Mocked SMS OTP. Always responds the same way whether or not the number is
 * registered, so the endpoint can't be used to discover parents' numbers.
 */
export async function requestOtp(phone: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const recent = await db.otpChallenge.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
  });
  if (recent >= OTP_MAX_PER_WINDOW) return { ok: false, error: "Too many codes requested. Try again in 15 minutes." };

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) return { ok: true };

  const code = mockOtpCode() ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.otpChallenge.create({
    data: { phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  console.log(`[mock-sms] OTP for +${phone}: ${code}`);
  return { ok: true };
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<{ ok: true; role: Role; needsConsent: boolean } | { ok: false; error: string }> {
  const invalid = { ok: false as const, error: "That code is not right or has expired." };
  const challenge = await db.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return invalid;
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "Too many attempts. Request a new code." };

  const expected = Buffer.from(challenge.codeHash, "hex");
  const actual = Buffer.from(sha256(`${phone}:${code}`), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await db.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return invalid;
  }

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) return invalid;

  await db.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { tokenHash: sha256(token), userId: user.id, expiresAt } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true, role: user.role as Role, needsConsent: user.role === "parent" && !user.consentAt };
}

export async function getCurrentUser() {
  // Everything behind a session is per-request: stop prerendering here so the
  // clock (new Date) and DB reads below always run at request time.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  store.delete(SESSION_COOKIE);
}

/** Use at the top of every page and server action. Redirects if not allowed. */
export async function requireUser(role: Role) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect("/");
  if (role === "parent" && !user.consentAt) redirect("/consent");
  return user;
}

/**
 * Access control for parent data: returns the student only if it belongs to
 * this parent. Callers render notFound() on null — we never reveal whether
 * another family's student code exists.
 */
export async function findOwnStudent(parentId: string, studentCode: string) {
  return db.student.findFirst({ where: { code: studentCode, parentId } });
}

export async function findOwnInstalment(parentId: string, instalmentCode: string) {
  return db.instalment.findFirst({
    where: { code: instalmentCode, feePlan: { student: { parentId } } },
  });
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";

// Per-user page (session/cookies): render at request time, skip instant-nav validation.
export const instant = false;

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "accounts" ? "/accounts" : "/parent");
}

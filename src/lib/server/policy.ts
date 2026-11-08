import { db } from "./db";

export async function loadActivePolicy() {
  return db.refundPolicy.findFirst({
    where: { active: true },
    include: { tiers: { orderBy: { upToWeek: "asc" } } },
  });
}

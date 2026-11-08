// `npx prisma db seed` — same code path as the "Reset demo data" button.
import "dotenv/config";
import { db } from "../src/lib/server/db";
import { today } from "../src/lib/server/clock";
import { seedDemo } from "../src/lib/server/demo-seed";

seedDemo(today())
  .then((s) => console.log(`Seeded as of ${s.asOf}:`, JSON.stringify(s)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

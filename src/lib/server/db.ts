import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

// Runtime uses the pooled connection (DATABASE_URL). Migrations use the direct
// one (DIRECT_URL) via prisma.config.ts.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  // Small pool: serverless functions run many instances; Neon's pooler fans in.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;

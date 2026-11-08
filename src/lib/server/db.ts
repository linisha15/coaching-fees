import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

// Swapping to Postgres: change the schema provider and use @prisma/adapter-pg here.
function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  return new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;

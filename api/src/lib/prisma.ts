import "dotenv/config";
import { PrismaClient } from "@/src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DATABASE_URL } from "@/src/utils/core"

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({
  connectionString: DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

export { prisma };
export default prisma;

import prisma from "../src/lib/prisma";
import { hashPassword } from "@/src/utils/core";

async function main() {
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "alice@prisma.io" },
      update: { name: "Alice" },
      create: {
        email: "alice@prisma.io",
        username: "alice",
        name: "Alice",
        password: await hashPassword("alice123"),
        tokenVersion: 1,
      },
    }),
    prisma.user.upsert({
      where: { email: "bob@prisma.io" },
      update: { name: "Bob" },
      create: {
        email: "bob@prisma.io",
        username: "bob",
        name: "Bob",
        password: await hashPassword("bob123"),
        tokenVersion: 1,
      },
    }),
    prisma.user.upsert({
      where: { email: "test@user.com" },
      update: { name: "Test User" },
      create: {
        email: "test@user.com",
        username: "test",
        name: "Test User",
        password: await hashPassword("test123"),
        tokenVersion: 1,
      },
    }),
  ]);

  console.log(`Seeded ${users.length} users.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

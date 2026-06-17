import { prisma } from "./lib/prisma";
import { boss } from "./lib/boss";
import { startQueue } from "./queue";

async function main() {
  await startQueue();
}

async function shutdown() {
  await boss.stop({ graceful: true });
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

void main();

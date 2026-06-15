import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client.js";

let client: PrismaClient | undefined;

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    }),
  });
}

export function getPrismaClient() {
  client ??= createPrismaClient();
  return client;
}

export { PrismaClient };
export * from "../generated/client/enums.js";

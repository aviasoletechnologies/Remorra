import { createPrismaClient } from "@remorra/database";
import { config } from "../config";

export const prisma = createPrismaClient(config.databaseUrl);

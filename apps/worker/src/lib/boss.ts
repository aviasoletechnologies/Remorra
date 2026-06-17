import { PgBoss } from "pg-boss";
import { config } from "../config";

export const boss = new PgBoss({
  connectionString: config.databaseUrl,
  max: config.pgBossPoolMax,
});

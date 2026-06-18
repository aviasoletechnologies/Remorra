export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  pgBossPoolMax: Number(process.env.PG_BOSS_POOL_MAX ?? 2),
  get llmProvider(): string {
    return process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
  },
  get isGrok(): boolean {
    return this.llmProvider === "groq" || this.llmProvider === "grok";
  },
  get anthropicApiKey(): string | undefined {
    return !this.isGrok ? required("ANTHROPIC_API_KEY") : process.env.ANTHROPIC_API_KEY;
  },
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabasePrivateBucket: process.env.SUPABASE_PRIVATE_BUCKET ?? "private-documents",
  freeTierTokenCap: Number(process.env.FREE_TIER_TOKEN_CAP ?? 500000),
  get enabledQueues(): string[] {
    const val = process.env.ENABLED_QUEUES || "ai.conversation";
    if (val === "all") {
      return [
        "ai.conversation",
        "ai.report",
        "ai.summary",
        "document.render",
        "gdpr.export",
        "gdpr.delete",
        "retention.cleanup",
        "storage.expire",
      ];
    }
    return val.split(",").map((q) => q.trim());
  },
};

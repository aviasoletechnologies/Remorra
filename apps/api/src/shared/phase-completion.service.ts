import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma.service.js";

// Per HARDIK doc Q10: phase completion is judged by a flag the Skill itself
// emits in its structured JSON output — never by counting messages or
// inferring from the conversation going idle.
const PHASE_COMPLETION_FLAG: Record<string, string> = {
  discover: "discover_complete",
  refine: "pass_criteria_met",
};

@Injectable()
export class PhaseCompletionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns whether the given phase's completion flag has been emitted by
   * its Skill in the active session's most recent structured output.
   * Phases with no completion flag (initiate/venture/evolve) are always
   * considered complete for gating purposes — they have their own gates
   * (payment, Health Score) elsewhere.
   */
  async isComplete(projectId: string, phase: string): Promise<boolean> {
    const flagKey = PHASE_COMPLETION_FLAG[phase];
    if (!flagKey) return true;

    const conversation = await this.prisma.client.conversation.findFirst({
      where: { projectId, kind: phase as any, status: "active" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (!conversation) return false;

    const extract = await this.prisma.client.structuredExtract.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    if (!extract) return false;

    const payload = extract.payload as Record<string, unknown> | null;
    return Boolean(payload && payload[flagKey] === true);
  }
}

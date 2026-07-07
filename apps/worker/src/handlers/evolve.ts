import { prisma } from "../lib/prisma";
import { parseAndValidateJson } from "../lib/utils";
import { invokeSkill } from "../assemblers/skills";
import {
  routeEntityActions,
  attachImpactItems,
  createContextProposal,
} from "../services/response-router";
import type { Payload } from "./conversation";

// RemoraDocument §7 — Event Router already picked "evolve-facilitator" by
// routing this message here (evolve.message queue is Evolve-only, mirroring
// how ai.conversation is Discover/Refine/Venture-only). This handler plays
// the Response Router role for that Skill's output: conversational text is
// saved as a ConversationMessage, any proposed entity changes become pending
// EvolveActions (Action Capability — nothing writes directly), and Goal
// changes additionally get an Impact Screener pass (Screening Engine).
export async function handleEvolveMessage(payload: Payload) {
  const projectId = String(payload.projectId ?? "");
  const userId = String(payload.userId ?? "");
  const conversationId = String(payload.conversationId ?? "");
  const evolveSessionId = String(payload.evolveSessionId ?? "");
  const content = String(payload.content ?? "");

  const result = await invokeSkill({
    skillId: "evolve-facilitator",
    userId,
    projectId,
    conversationId,
    content,
  });

  let displayText = result.text;

  // Layer 2 automation (RemoraDocument §10) — Evolve Facilitator proposes a
  // project.context update inline via this tag; founder confirms separately.
  let contextProposalId: string | null = null;
  const contextMatch = displayText.match(/<context_proposal>([\s\S]*?)<\/context_proposal>/i);
  if (contextMatch?.[1]?.trim()) {
    const proposal = await createContextProposal({
      projectId,
      evolveSessionId,
      proposedText: contextMatch[1].trim(),
    });
    contextProposalId = proposal.id;
    displayText = displayText.replace(/<context_proposal>[\s\S]*?<\/context_proposal>/gi, "").trim();
  }

  // Entity action operations — same <output_data> operations convention used
  // by every other table-schema Skill (see extract-mapper.ts), but routed to
  // pending EvolveActions instead of applied directly.
  const outputMatch = displayText.match(/<output_data>\s*([\s\S]*?)\s*<\/output_data>/i);
  let pendingActions: Array<{ actionId: string; entityType: string; requiresScreening: boolean }> = [];
  if (outputMatch?.[1]) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(outputMatch[1].trim());
    } catch {
      parsed = null;
    }
    displayText = displayText.replace(/<output_data>[\s\S]*?<\/output_data>/gi, "").trim();

    if (parsed && Array.isArray(parsed.operations)) {
      pendingActions = await routeEntityActions({
        projectId,
        evolveSessionId,
        operations: parsed.operations,
      });
    }
  }

  displayText = displayText.replace(/<skill_done\/>/g, "").trim();

  // The prompt tells the Skill to propose changes without explaining them, so
  // a pure-operations turn leaves displayText empty — without a fallback, no
  // ConversationMessage gets saved at all and the chat looks like it never
  // responded, even though the action/proposal was created successfully.
  if (!displayText) {
    if (pendingActions.length > 0) {
      displayText = `Proposed ${pendingActions.length === 1 ? "a change" : `${pendingActions.length} changes`} — see the card above to review and approve.`;
    } else if (contextProposalId) {
      displayText = "Proposed adding this to project context — see the card above to review.";
    }
  }

  // Save the assistant's reply before screening runs — screening is a second,
  // independent LLM call that can fail (rate limit, provider outage) without
  // the user's action even having a chance to be shown. If we saved the
  // message only after screening succeeded, a screening failure would throw
  // the whole job, leave zero visible response, and on pg-boss's automatic
  // retry re-run routeEntityActions from scratch — duplicating every pending
  // action created so far, since nothing here is idempotent.
  let savedAssistantMsg: any = null;
  if (conversationId && displayText) {
    savedAssistantMsg = await prisma.conversationMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: displayText,
        skillId: result.skill.id,
        skillVersionId: result.skill.versionId ?? null,
      },
    });
  }

  // Screening Engine — Goal actions get a cascade-impact pass before they can
  // ever be approved (RemoraDocument §7 step 2: "Impact Screener assesses
  // cascade across linked entities — 1 LLM call"). Best-effort: a failure
  // here leaves the action with zero impact items rather than aborting the
  // whole turn — the founder can still review and approve it manually.
  for (const action of pendingActions) {
    if (!action.requiresScreening) continue;

    try {
      const screenResult = await invokeSkill({
        skillId: "impact-screener",
        userId,
        projectId,
        content: `Assess the cascade impact of this proposed Goal change on linked Epics, Stories, and Personas:\n${JSON.stringify(action)}`,
      });

      const screenParsed = parseAndValidateJson(
        screenResult.text,
        (screenResult.skill.outputSchema as Record<string, unknown>) ?? {},
      ) as { items?: unknown };

      const rawItems = Array.isArray(screenParsed.items) ? screenParsed.items : [];
      await attachImpactItems(
        action.actionId,
        rawItems.map((item: any) => ({
          affectedEntityType: String(item?.affectedEntityType ?? "Unknown"),
          affectedEntityId: typeof item?.affectedEntityId === "string" ? item.affectedEntityId : null,
          severity: ["red", "amber", "green"].includes(item?.severity) ? item.severity : "amber",
          title: String(item?.title ?? "Impact"),
          reasoning: String(item?.reasoning ?? ""),
          suggestedAction: ["update", "delete", "create"].includes(item?.suggestedAction) ? item.suggestedAction : null,
          suggestedChange: item?.suggestedChange ?? undefined,
        })),
      );
    } catch (err) {
      console.warn(`[worker:evolve] impact screening failed for action ${action.actionId} — leaving with no impact items`, err);
    }
  }

  return {
    response: displayText,
    messageId: savedAssistantMsg?.id ?? null,
    skillId: result.skill.id,
    pendingActionIds: pendingActions.map((a) => a.actionId),
    contextProposalId,
  };
}

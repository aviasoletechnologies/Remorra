import { prisma } from "../lib/prisma";
import { jsonValue } from "../lib/utils";
import { logEntityAudit } from "../lib/audit";
import { runLayer1AutoCapture } from "./context-automation";

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function normalizeRefKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function registerRef(
  refMap: Map<string, string>,
  normalizedRefMap: Map<string, string | null>,
  key: unknown,
  id: unknown,
) {
  if (typeof key !== "string" || !key.trim() || typeof id !== "string" || !id) return;

  refMap.set(key, id);

  const normalized = normalizeRefKey(key);
  if (!normalized) return;

  const existing = normalizedRefMap.get(normalized);
  if (existing === undefined || existing === id) {
    normalizedRefMap.set(normalized, id);
  } else {
    normalizedRefMap.set(normalized, null);
  }
}

function resolveRef(
  refMap: Map<string, string>,
  normalizedRefMap: Map<string, string | null>,
  key: string,
): string | undefined {
  const exact = refMap.get(key);
  if (exact) return exact;

  const normalized = normalizeRefKey(key);
  if (!normalized) return undefined;

  return normalizedRefMap.get(normalized) ?? undefined;
}

// Returns list of DB events fired (e.g. ["persona.create", "goal.create"])
// Event name = snake_case(delegateName) + "." + action — matches SkillEventMapping format
export async function applyOperationsExtract(projectId: string, actorId: string, json: any, allowedActionsMap?: Record<string, string[]>): Promise<string[]> {
  if (!Array.isArray(json.operations)) return [];

  const refMap = new Map<string, string>();
  const normalizedRefMap = new Map<string, string | null>();
  const firedEvents: string[] = [];

  for (const op of json.operations) {
    const entityRaw = String(op.entity ?? "");
    if (!entityRaw) continue;
    const delegateName = entityRaw.charAt(0).toLowerCase() + entityRaw.slice(1);

    if (allowedActionsMap) {
      const allowed = allowedActionsMap[entityRaw];
      if (allowed && !allowed.includes(op.action)) {
        console.warn(`[applyOperationsExtract] action "${op.action}" blocked for entity "${entityRaw}" — allowed: [${allowed.join(", ")}]`);
        continue;
      }
    }

    // Project: only update allowed (never create/delete), restricted to safe fields, uses projectId
    if (delegateName === "project") {
      if (op.action === "update" && op.data && typeof op.data === "object") {
        try {
          const allowedFields = ["summary", "name"];
          const filteredData: Record<string, any> = {};
          for (const [key, val] of Object.entries(op.data as Record<string, any>)) {
            if (allowedFields.includes(key)) filteredData[key] = val;
          }
          if (Object.keys(filteredData).length > 0) {
            const before = await (prisma as any).project.findUnique({ where: { id: projectId } });
            const after = await (prisma as any).project.update({ where: { id: projectId }, data: filteredData });
            await logEntityAudit({
              projectId, actorId, eventType: "project.update",
              entityType: "Project", entityId: projectId, before, after,
            });
            firedEvents.push("project.update");
          }
        } catch (err) {
          console.warn(`[applyOperationsExtract] project update failed:`, err);
        }
      }
      continue;
    }

    const delegate = (prisma as any)[delegateName];
    if (!delegate?.create) continue;
    try {
      if (op.action === "create" && op.data && typeof op.data === "object") {
        // Resolve any "$ref" values in data fields before inserting
        const resolvedData: Record<string, any> = {};
        let refFailed = false;
        for (const [key, val] of Object.entries(op.data as Record<string, any>)) {
          if (typeof val === "string" && val.startsWith("$")) {
            const refKey = val.slice(1);
            const resolved = resolveRef(refMap, normalizedRefMap, refKey);
            if (!resolved) {
              console.warn(`[applyOperationsExtract] unresolved ref "${val}" on entity=${entityRaw} field=${key} — skipping op`);
              refFailed = true;
              break;
            }
            resolvedData[key] = resolved;
          } else {
            resolvedData[key] = val;
          }
        }
        if (refFailed) continue;

        const created = await delegate.create({ data: { projectId, ...resolvedData } });

        // Store generated id in refMap if op has a ref label
        registerRef(refMap, normalizedRefMap, op.ref, created?.id);
        // Fallback: also store by name/title/objective to handle AI referencing by name/title
        if (created?.id) {
          registerRef(refMap, normalizedRefMap, created.name, created.id);
          registerRef(refMap, normalizedRefMap, created.title, created.id);
          registerRef(refMap, normalizedRefMap, created.objective, created.id);
        }

        await logEntityAudit({
          projectId, actorId, eventType: `${toSnakeCase(delegateName)}.create`,
          entityType: entityRaw, entityId: created.id, before: null, after: created,
        });
        firedEvents.push(`${toSnakeCase(delegateName)}.${op.action}`);
      } else if (op.action === "update" && op.id && op.data && typeof op.data === "object") {
        let targetId = op.id;
        if (typeof targetId === "string" && targetId.startsWith("$")) {
          const refKey = targetId.slice(1);
          const resolved = resolveRef(refMap, normalizedRefMap, refKey);
          if (!resolved) {
            console.warn(`[applyOperationsExtract] unresolved update ref target "${targetId}" on entity=${entityRaw} — skipping op`);
            continue;
          }
          targetId = resolved;
        }

        const resolvedData: Record<string, any> = {};
        let refFailed = false;
        for (const [key, val] of Object.entries(op.data as Record<string, any>)) {
          if (typeof val === "string" && val.startsWith("$")) {
            const refKey = val.slice(1);
            const resolved = resolveRef(refMap, normalizedRefMap, refKey);
            if (!resolved) {
              console.warn(`[applyOperationsExtract] unresolved ref "${val}" on update entity=${entityRaw} field=${key} — skipping op`);
              refFailed = true;
              break;
            }
            resolvedData[key] = resolved;
          } else {
            resolvedData[key] = val;
          }
        }
        if (refFailed) continue;

        const before = await delegate.findUnique({ where: { id: targetId } });
        const after = await delegate.update({ where: { id: targetId }, data: resolvedData });
        await logEntityAudit({
          projectId, actorId, eventType: `${toSnakeCase(delegateName)}.update`,
          entityType: entityRaw, entityId: targetId, before, after,
        });
        firedEvents.push(`${toSnakeCase(delegateName)}.${op.action}`);
      } else if (op.action === "delete" && op.id) {
        let targetId = op.id;
        if (typeof targetId === "string" && targetId.startsWith("$")) {
          const refKey = targetId.slice(1);
          const resolved = resolveRef(refMap, normalizedRefMap, refKey);
          if (!resolved) {
            console.warn(`[applyOperationsExtract] unresolved delete ref target "${targetId}" on entity=${entityRaw} — skipping op`);
            continue;
          }
          targetId = resolved;
        }
        const deleted = await delegate.delete({ where: { id: targetId } });
        await logEntityAudit({
          projectId, actorId, eventType: `${toSnakeCase(delegateName)}.delete`,
          entityType: entityRaw, entityId: targetId, before: deleted, after: null,
        });
        firedEvents.push(`${toSnakeCase(delegateName)}.${op.action}`);
      }
    } catch (err) {
      console.warn(`[applyOperationsExtract] op failed entity=${entityRaw} action=${op.action} id=${op.id ?? ""}:`, err);
    }
  }

  if (firedEvents.length > 0) {
    await runLayer1AutoCapture(projectId).catch((err) =>
      console.warn(`[applyOperationsExtract] Layer 1 auto-capture failed:`, err),
    );
  }

  return firedEvents;
}

export async function applyGenericExtractMappings(projectId: string, actorId: string, json: any) {
  if (!json || typeof json !== "object") return;

  const j: Record<string, any> = {};
  for (const [k, v] of Object.entries(json)) {
    j[k.toLowerCase()] = v;
  }

  // 1. Project mapping
  const projectData = j.project || j.projects;
  if (projectData && typeof projectData === "object") {
    const data: any = {};
    if (typeof projectData.summary === "string") data.summary = projectData.summary;
    if (typeof projectData.name === "string") data.name = projectData.name;
    if (Object.keys(data).length > 0) {
      const before = await prisma.project.findUnique({ where: { id: projectId } });
      const after = await prisma.project.update({
        where: { id: projectId },
        data,
      });
      await logEntityAudit({
        projectId, actorId, eventType: "project.update",
        entityType: "Project", entityId: projectId, before, after,
      });
    }
  }

  // Helper maps to store created/updated IDs for linkage (V4.4: Goal -> Epic -> Story, Persona -> PainPoint)
  const personaMap = new Map<string, string>(); // name -> id
  const goalMap = new Map<string, string>(); // title -> id
  const epicMap = new Map<string, string>(); // title -> id

  const existingPersonas = await prisma.persona.findMany({ where: { projectId } });
  for (const p of existingPersonas) {
    personaMap.set(p.name.toLowerCase(), p.id);
  }

  const existingGoals = await prisma.goal.findMany({ where: { projectId } });
  for (const g of existingGoals) {
    goalMap.set(g.title.toLowerCase(), g.id);
  }

  const existingEpics = await prisma.epic.findMany({ where: { projectId } });
  for (const e of existingEpics) {
    epicMap.set(e.title.toLowerCase(), e.id);
  }

  // 2. Goals mapping
  const goals = j.goals || j.goal;
  if (Array.isArray(goals)) {
    for (const item of goals) {
      if (!item || typeof item !== "object" || !item.title) continue;
      const title = String(item.title);
      const detail = String(item.detail ?? "");
      const key = title.toLowerCase();
      let id = goalMap.get(key);
      if (id) {
        const before = await prisma.goal.findUnique({ where: { id } });
        const after = await prisma.goal.update({ where: { id }, data: { detail } });
        await logEntityAudit({ projectId, actorId, eventType: "goal.update", entityType: "Goal", entityId: id, before, after });
      } else {
        const created = await prisma.goal.create({
          data: { projectId, title, detail },
        });
        goalMap.set(key, created.id);
        await logEntityAudit({ projectId, actorId, eventType: "goal.create", entityType: "Goal", entityId: created.id, before: null, after: created });
      }
    }
  }

  // 3. Personas mapping
  let personas = j.personas || j.persona;
  if (personas && typeof personas === "object" && !Array.isArray(personas)) {
    personas = [personas];
  }
  if (Array.isArray(personas)) {
    for (const item of personas) {
      if (!item || typeof item !== "object" || !item.name) continue;
      const name = String(item.name);
      const description = String(item.description ?? "");
      const key = name.toLowerCase();
      let id = personaMap.get(key);
      if (id) {
        const before = await prisma.persona.findUnique({ where: { id } });
        const after = await prisma.persona.update({ where: { id }, data: { description } });
        await logEntityAudit({ projectId, actorId, eventType: "persona.update", entityType: "Persona", entityId: id, before, after });
      } else {
        const created = await prisma.persona.create({
          data: { projectId, name, description },
        });
        personaMap.set(key, created.id);
        await logEntityAudit({ projectId, actorId, eventType: "persona.create", entityType: "Persona", entityId: created.id, before: null, after: created });
      }
    }
  }

  // 4. Pain points mapping
  const painpoints = j.painpoints || j.pain_points || j.painpoint || j.pain_point;
  if (Array.isArray(painpoints)) {
    for (const item of painpoints) {
      if (!item || typeof item !== "object" || !item.statement) continue;
      const statement = String(item.statement);
      const personaFk = String(item.persona_fk || item.personaId || "").toLowerCase();
      let personaId = personaMap.get(personaFk);
      if (!personaId && personaMap.size === 1) {
        personaId = Array.from(personaMap.values())[0];
      }
      if (!personaId) continue;

      const existingPp = await prisma.painPoint.findFirst({
        where: { projectId, personaId, statement },
      });
      if (!existingPp) {
        const created = await prisma.painPoint.create({
          data: { projectId, personaId, statement },
        });
        await logEntityAudit({ projectId, actorId, eventType: "pain_point.create", entityType: "PainPoint", entityId: created.id, before: null, after: created });
      }
    }
  }

  // 5. Epics mapping (parent: Goal)
  const epics = j.epics || j.epic;
  if (Array.isArray(epics)) {
    for (const item of epics) {
      if (!item || typeof item !== "object" || !item.title) continue;
      const title = String(item.title);
      const description = item.description ? String(item.description) : null;
      const goalFk = String(item.goal_fk || item.goalId || "").toLowerCase();
      let goalId = goalMap.get(goalFk);
      if (!goalId && goalMap.size === 1) {
        goalId = Array.from(goalMap.values())[0];
      }
      if (!goalId) continue;

      const key = title.toLowerCase();
      let id = epicMap.get(key);
      if (!id) {
        const created = await prisma.epic.create({
          data: { projectId, goalId, title, description },
        });
        epicMap.set(key, created.id);
        await logEntityAudit({ projectId, actorId, eventType: "epic.create", entityType: "Epic", entityId: created.id, before: null, after: created });
      }
    }
  }

  // 6. Stories mapping (parent: Epic)
  const stories = j.stories || j.story;
  if (Array.isArray(stories)) {
    for (const item of stories) {
      if (!item || typeof item !== "object" || !item.title) continue;
      const title = String(item.title);
      const acceptance = item.acceptance || item.acceptance_criteria || item.acceptanceCriteria || [];
      const epicFk = String(item.epic_fk || item.epicId || "").toLowerCase();
      let epicId = epicMap.get(epicFk);
      if (!epicId && epicMap.size === 1) {
        epicId = Array.from(epicMap.values())[0];
      }
      if (!epicId) continue;

      const existingStory = await prisma.story.findFirst({
        where: { projectId, epicId, title },
      });
      if (!existingStory) {
        const created = await prisma.story.create({
          data: {
            projectId,
            epicId,
            title,
            acceptance: jsonValue(acceptance),
          },
        });
        await logEntityAudit({ projectId, actorId, eventType: "story.create", entityType: "Story", entityId: created.id, before: null, after: created });
      }
    }
  }

  // 7. RAID items mapping
  const raidItems = j.raiditems || j.raid_items || j.raiditem || j.raid_item;
  if (Array.isArray(raidItems)) {
    for (const item of raidItems) {
      if (!item || typeof item !== "object" || !item.title) continue;
      const title = String(item.title);
      const type = String(item.type ?? "risk");
      const existingRaid = await prisma.raidItem.findFirst({
        where: { projectId, title, type },
      });
      if (!existingRaid) {
        const created = await prisma.raidItem.create({
          data: {
            projectId,
            type,
            title,
            description: item.description ? String(item.description) : null,
            status: String(item.status ?? "open"),
            severity: String(item.severity ?? "amber"),
          },
        });
        await logEntityAudit({ projectId, actorId, eventType: "raid_item.create", entityType: "RaidItem", entityId: created.id, before: null, after: created });
      }
    }
  }

  await runLayer1AutoCapture(projectId).catch((err) =>
    console.warn(`[applyGenericExtractMappings] Layer 1 auto-capture failed:`, err),
  );
}

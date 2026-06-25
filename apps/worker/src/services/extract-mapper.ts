import { prisma } from "../lib/prisma";
import { jsonValue } from "../lib/utils";

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

// Returns list of DB events fired (e.g. ["persona.create", "user_need.create"])
// Event name = snake_case(delegateName) + "." + action — matches SkillEventMapping format
export async function applyOperationsExtract(projectId: string, json: any, allowedActionsMap?: Record<string, string[]>): Promise<string[]> {
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
            await (prisma as any).project.update({ where: { id: projectId }, data: filteredData });
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

        await delegate.update({ where: { id: targetId }, data: resolvedData });
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
        await delegate.delete({ where: { id: targetId } });
        firedEvents.push(`${toSnakeCase(delegateName)}.${op.action}`);
      }
    } catch (err) {
      console.warn(`[applyOperationsExtract] op failed entity=${entityRaw} action=${op.action} id=${op.id ?? ""}:`, err);
    }
  }

  return firedEvents;
}

export async function applyGenericExtractMappings(projectId: string, json: any) {
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
      await prisma.project.update({
        where: { id: projectId },
        data,
      });
    }
  }

  // Helper mapping maps to store created/updated IDs for linkage
  const personaMap = new Map<string, string>(); // name -> id
  const ambitionMap = new Map<string, string>(); // title -> id
  const needMap = new Map<string, string>(); // statement -> id

  // Load existing personas to seed the map
  const existingPersonas = await prisma.persona.findMany({ where: { projectId } });
  for (const p of existingPersonas) {
    personaMap.set(p.name.toLowerCase(), p.id);
  }

  // Load existing ambitions to seed the map
  const existingAmbitions = await prisma.ambition.findMany({ where: { projectId } });
  for (const a of existingAmbitions) {
    ambitionMap.set(a.title.toLowerCase(), a.id);
  }

  // 2. Ambitions mapping
  const ambitions = j.ambitions || j.ambition;
  if (Array.isArray(ambitions)) {
    for (const item of ambitions) {
      if (!item || typeof item !== "object" || !item.title) continue;
      const title = String(item.title);
      const detail = String(item.detail ?? "");
      const key = title.toLowerCase();
      let id = ambitionMap.get(key);
      if (id) {
        await prisma.ambition.update({ where: { id }, data: { detail } });
      } else {
        const created = await prisma.ambition.create({
          data: { projectId, title, detail },
        });
        ambitionMap.set(key, created.id);
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
        await prisma.persona.update({ where: { id }, data: { description } });
      } else {
        const created = await prisma.persona.create({
          data: { projectId, name, description },
        });
        personaMap.set(key, created.id);
      }
    }
  }

  // Load existing user needs to seed map
  const existingNeeds = await prisma.userNeed.findMany({ where: { projectId } });
  for (const n of existingNeeds) {
    needMap.set(n.statement.toLowerCase(), n.id);
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
        await prisma.painPoint.create({
          data: { projectId, personaId, statement },
        });
      }
    }
  }

  // 5. User needs mapping
  const userNeeds = j.userneeds || j.user_needs || j.userneed || j.user_need;
  if (Array.isArray(userNeeds)) {
    for (const item of userNeeds) {
      if (!item || typeof item !== "object" || !item.statement) continue;
      const statement = String(item.statement);
      const personaFk = String(item.persona_fk || item.personaId || "").toLowerCase();
      let personaId = personaMap.get(personaFk);
      if (!personaId && personaMap.size === 1) {
        personaId = Array.from(personaMap.values())[0];
      }
      if (!personaId) continue;

      let id = needMap.get(statement.toLowerCase());
      if (!id) {
        const created = await prisma.userNeed.create({
          data: { projectId, personaId, statement },
        });
        needMap.set(statement.toLowerCase(), created.id);
      }
    }
  }

  // 6. OKRs mapping
  const okrs = j.okrs || j.okr;
  if (Array.isArray(okrs)) {
    for (const item of okrs) {
      if (!item || typeof item !== "object" || !item.objective) continue;
      const objective = String(item.objective);
      const keyResults = item.keyresults || item.key_results || item.keyResults || [];
      const ambitionFk = String(item.ambition_fk || item.ambitionId || "").toLowerCase();
      let ambitionId = ambitionMap.get(ambitionFk);
      if (!ambitionId && ambitionMap.size === 1) {
        ambitionId = Array.from(ambitionMap.values())[0];
      }
      if (!ambitionId) continue;

      const existingOkr = await prisma.okr.findFirst({
        where: { projectId, ambitionId, objective },
      });
      if (!existingOkr) {
        await prisma.okr.create({
          data: {
            projectId,
            ambitionId,
            objective,
            keyResults: jsonValue(keyResults),
          },
        });
      }
    }
  }

  // 7. User stories mapping
  const userStories = j.userstories || j.user_stories || j.userstory || j.user_story;
  if (Array.isArray(userStories)) {
    for (const item of userStories) {
      if (!item || typeof item !== "object" || !item.title) continue;
      const title = String(item.title);
      const acceptance = item.acceptance || item.acceptance_criteria || item.acceptanceCriteria || [];
      const needFk = String(item.need_fk || item.userneedid || item.userNeedId || "").toLowerCase();
      let userNeedId = needMap.get(needFk);
      if (!userNeedId && needMap.size === 1) {
        userNeedId = Array.from(needMap.values())[0];
      }
      if (!userNeedId) continue;

      const existingStory = await prisma.userStory.findFirst({
        where: { projectId, userNeedId, title },
      });
      if (!existingStory) {
        await prisma.userStory.create({
          data: {
            projectId,
            userNeedId,
            title,
            acceptance: jsonValue(acceptance),
          },
        });
      }
    }
  }
}

import { prisma } from "../lib/prisma";
import { jsonValue } from "../lib/utils";

export async function applyOperationsExtract(projectId: string, json: any) {
  if (!Array.isArray(json.operations)) return;
  for (const op of json.operations) {
    const entityRaw = String(op.entity ?? "");
    if (!entityRaw) continue;
    const delegateName = entityRaw.charAt(0).toLowerCase() + entityRaw.slice(1);
    const delegate = (prisma as any)[delegateName];
    if (!delegate?.create) continue;
    try {
      if (op.action === "create" && op.data && typeof op.data === "object") {
        await delegate.create({ data: { projectId, ...op.data } });
      } else if (op.action === "update" && op.id && op.data && typeof op.data === "object") {
        await delegate.update({ where: { id: op.id }, data: op.data });
      } else if (op.action === "delete" && op.id) {
        await delegate.delete({ where: { id: op.id } });
      }
    } catch (err) {
      console.warn(`[applyOperationsExtract] op failed entity=${entityRaw} action=${op.action} id=${op.id ?? ""}:`, err);
    }
  }
}

export async function applyGenericExtractMappings(projectId: string, json: any) {
  if (!json || typeof json !== "object") return;

  // 1. Project mapping
  const projectData = json.project;
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
  const ambitions = json.ambitions || json.ambition;
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
  let personas = json.personas || json.persona;
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
  const painpoints = json.painpoints || json.painPoints || json.pain_points;
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
  const userNeeds = json.userNeeds || json.user_needs || json.userNeed || json.user_need;
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
  const okrs = json.okrs || json.okr;
  if (Array.isArray(okrs)) {
    for (const item of okrs) {
      if (!item || typeof item !== "object" || !item.objective) continue;
      const objective = String(item.objective);
      const keyResults = item.keyResults || item.key_results || [];
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
  const userStories = json.userStories || json.user_stories || json.userStory || json.user_story;
  if (Array.isArray(userStories)) {
    for (const item of userStories) {
      if (!item || typeof item !== "object" || !item.title) continue;
      const title = String(item.title);
      const acceptance = item.acceptance || item.acceptance_criteria || [];
      const needFk = String(item.need_fk || item.userNeedId || "").toLowerCase();
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

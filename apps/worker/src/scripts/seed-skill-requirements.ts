import { prisma } from "../lib/prisma";

// Maps skillId → contextRequirements array.
// Only includes requirements the assembler actually fetches (project/founder are now
// in the system prompt suffix, so they are excluded here to avoid duplication).
const requirementsMap: Record<string, string[]> = {
  "brain-dump-facilitator":  [],
  "evolve-facilitator":      ["personas.all_with_pain_points_and_user_needs", "ambitions.all"],
  "document-drafter":        ["founder_pack.current"],
  "refine-facilitator":      ["personas.all", "ambitions.all"],
  "linkage-review":          ["linkage_map.full"],
  "backlog-builder":         ["personas.all_with_pain_points_and_user_needs", "ambitions.all", "user_stories.all"],
};

async function main() {
  const activeVersions = await prisma.skillVersion.findMany({
    where: { active: true },
    select: { id: true, skillId: true, version: true },
  });

  console.log(`Found ${activeVersions.length} active skill versions.`);

  for (const version of activeVersions) {
    const requirements = requirementsMap[version.skillId];
    if (requirements === undefined) {
      console.warn(`[skip] No requirements defined for skillId="${version.skillId}" (v${version.version}) — leaving unchanged`);
      continue;
    }

    await prisma.skillVersion.update({
      where: { id: version.id },
      data: { contextRequirements: requirements },
    });

    console.log(`[updated] skillId="${version.skillId}" v${version.version} → requirements=${JSON.stringify(requirements)}`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

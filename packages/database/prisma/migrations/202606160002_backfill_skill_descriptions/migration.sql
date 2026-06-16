UPDATE "Skill"
SET "description" = CASE "id"
  WHEN 'brain-dump-facilitator' THEN 'Captures the founder''s raw product idea and clarifies the problem, audience, concept, vision, and context.'
  WHEN 'entity-extractor' THEN 'Extracts structured facts from conversation and returns strict JSON.'
  WHEN 'founder-pack-generator' THEN 'Drafts the Founder Pack from confirmed Discover evidence and separates facts from assumptions.'
  WHEN 'refine-prompter' THEN 'Validates the Founder Pack and expands it into ambitions, OKRs, personas, pain points, and user needs.'
  WHEN 'linkage-contradiction-checker' THEN 'Checks linked entities for contradictions and evidence gaps.'
  WHEN 'viability-score-calculator' THEN 'Scores product readiness across problem, audience, concept, vision, commercial context, linkage, and cohesion.'
  WHEN 'daily-meeting-summary' THEN 'Summarizes daily standup updates, blockers, and active cycle context.'
  WHEN 'retrospective-insights' THEN 'Turns retrospective evidence into recurring themes and actionable improvements.'
  WHEN 'report-generator' THEN 'Creates structured product intelligence reports from immutable snapshots.'
  WHEN 'build-checklist-generator' THEN 'Creates a delivery setup checklist from the Product Pack, stories, risks, and cycle.'
  WHEN 'evolve-facilitator' THEN 'Guides discussion of proposed product changes and tradeoffs without applying them.'
  WHEN 'impact-screener' THEN 'Assesses the impact of proposed changes across linked product entities.'
  WHEN 'document-drafter' THEN 'Drafts clean documents from confirmed product records only.'
  ELSE "description"
END
WHERE "id" IN (
  'brain-dump-facilitator',
  'entity-extractor',
  'founder-pack-generator',
  'refine-prompter',
  'linkage-contradiction-checker',
  'viability-score-calculator',
  'daily-meeting-summary',
  'retrospective-insights',
  'report-generator',
  'build-checklist-generator',
  'evolve-facilitator',
  'impact-screener',
  'document-drafter'
);

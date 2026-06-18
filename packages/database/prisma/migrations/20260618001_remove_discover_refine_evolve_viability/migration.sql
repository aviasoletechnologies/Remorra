-- Migration: Remove discover, refine, evolve, viability modules
-- These phases are replaced by the unified workspace-flow + skills system.

-- 1. Delete conversations from removed phases (and their messages/extracts cascade)
DELETE FROM "Conversation" WHERE kind IN ('discover', 'refine', 'evolve');

-- 2. Drop tables for removed modules (in dependency order — children first)
DROP TABLE IF EXISTS "ImpactItem";
DROP TABLE IF EXISTS "EvolveSession";
DROP TABLE IF EXISTS "RefineProposal";
DROP TABLE IF EXISTS "EntityLinkCheck";
DROP TABLE IF EXISTS "ProductPack";
DROP TABLE IF EXISTS "RefineSession";
DROP TABLE IF EXISTS "ViabilitySnapshot";
DROP TABLE IF EXISTS "FounderPack";

-- 3. Drop unused enums (if they exist standalone)
-- ConversationKind values 'discover', 'refine', 'evolve' are now unused
-- Postgres does not support removing individual enum values; the enum is
-- kept with only 'workspace' being used going forward.
-- If you need strict enum cleanup, do: ALTER TYPE ... RENAME + recreate.

-- ═══════════════════════════════════════════════════════════════════
-- Migration: drop the legacy static past-paper archive
-- The old past_papers / pp_questions / pp_essays tables and their Go/TS code
-- predate the new paper-engine past-paper feature (papers.type='pastpaper' +
-- practice_attempts + paper_media). They held no live data (verified empty)
-- and nothing references them anymore.
--
-- Apply manually AFTER confirming the tables are empty:
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/migrate_drop_legacy_pastpapers.sql
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS pp_essays;
DROP TABLE IF EXISTS pp_questions;
DROP TABLE IF EXISTS past_papers;

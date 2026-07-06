-- ═══════════════════════════════════════════════════════════════════
-- Migration: past papers carry no grade level
-- papers.grade (12/13 level) becomes nullable. Past papers are created with a
-- NULL grade; daily/SRP still set it. Attempt results are unaffected — grade is
-- a paper-level classification, not a result.
--
-- Apply manually:
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/migrate_paper_grade_nullable.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE papers ALTER COLUMN grade DROP NOT NULL;

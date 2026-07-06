-- ═══════════════════════════════════════════════════════════════════
-- Migration: past-paper answers PDF (combined structured + essay answers)
-- Adds an 'answers' slot to paper_media. This PDF is openly viewable (not
-- gated like exam content) — it contains the STRUCTURED/ESSAY answers only.
-- The interactive MCQ answer key stays server-side and is never exposed.
--
-- Apply manually:
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/migrate_answers_pdf.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE paper_media DROP CONSTRAINT IF EXISTS paper_media_slot_check;
ALTER TABLE paper_media ADD CONSTRAINT paper_media_slot_check
  CHECK (slot IN ('structured','essay','answers'));

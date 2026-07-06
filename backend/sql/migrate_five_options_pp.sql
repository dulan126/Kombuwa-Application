-- ═══════════════════════════════════════════════════════════════════
-- Migration: 5-option MCQs + past-paper provenance flag
-- 1. questions.option_e (5th option). Existing rows backfill to '' and are
--    treated as "incomplete" until an admin fills them; new/edited questions
--    require all 5. Reversible: DROP COLUMN option_e.
-- 2. correct_option may now be 'E'.
-- 3. questions.is_pp — true when authored from the past-paper path.
-- 4. question_media allows an image on option 'e'.
--
-- Apply manually:
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/migrate_five_options_pp.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_e TEXT NOT NULL DEFAULT '';

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_correct_option_check;
ALTER TABLE questions ADD CONSTRAINT questions_correct_option_check
  CHECK (correct_option IN ('A','B','C','D','E'));

ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_pp BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_questions_is_pp ON questions(is_pp);

ALTER TABLE question_media DROP CONSTRAINT IF EXISTS question_media_slot_check;
ALTER TABLE question_media ADD CONSTRAINT question_media_slot_check
  CHECK (slot IN ('question','a','b','c','d','e'));

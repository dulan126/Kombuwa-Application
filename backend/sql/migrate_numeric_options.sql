-- ═══════════════════════════════════════════════════════════════════
-- Migration: number the MCQ answers (A–E → 1–5)
-- Real past-paper answer keys use numbers, so correct_option and the stored
-- student answers switch from letters to digits. Option TEXT columns
-- (option_a..option_e) and image slots (a..e) keep their internal names —
-- only the answer LABEL/VALUE changes.
--
-- Apply:
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/migrate_numeric_options.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the old A–E constraint first so the data update doesn't transiently violate it.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_correct_option_check;

UPDATE questions SET correct_option = CASE correct_option
  WHEN 'A' THEN '1' WHEN 'B' THEN '2' WHEN 'C' THEN '3' WHEN 'D' THEN '4' WHEN 'E' THEN '5'
  ELSE correct_option END
WHERE correct_option IN ('A','B','C','D','E');

ALTER TABLE questions ADD CONSTRAINT questions_correct_option_check
  CHECK (correct_option IN ('1','2','3','4','5'));

-- Historical submitted answers stored their selected option as a letter; convert
-- to the matching digit so past marking-scheme / practice reviews stay consistent.
UPDATE attempts SET answers = (
  SELECT COALESCE(jsonb_object_agg(k, CASE val
    WHEN 'A' THEN '1' WHEN 'B' THEN '2' WHEN 'C' THEN '3' WHEN 'D' THEN '4' WHEN 'E' THEN '5'
    ELSE val END), '{}'::jsonb)
  FROM jsonb_each_text(answers) AS e(k, val)
) WHERE answers IS NOT NULL AND answers <> '{}'::jsonb;

UPDATE practice_attempts SET answers = (
  SELECT COALESCE(jsonb_object_agg(k, CASE val
    WHEN 'A' THEN '1' WHEN 'B' THEN '2' WHEN 'C' THEN '3' WHEN 'D' THEN '4' WHEN 'E' THEN '5'
    ELSE val END), '{}'::jsonb)
  FROM jsonb_each_text(answers) AS e(k, val)
) WHERE answers IS NOT NULL AND answers <> '{}'::jsonb;

COMMIT;

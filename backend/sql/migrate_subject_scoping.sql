-- ═══════════════════════════════════════════════════════════════════
-- Migration: Subject scoping for admin workflows
-- 1. Indexes for subject-only filters on papers & questions
-- 2. questions.subject_id becomes mandatory (NOT NULL + RESTRICT)
--
-- Apply manually:
--   docker exec backend-postgres-1 psql -U miedvance_user -d miedvance \
--     -f /path/to/migrate_subject_scoping.sql
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_papers_subject    ON papers(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);

-- Safety guard: refuse to run if any question lacks a subject.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM questions WHERE subject_id IS NULL) THEN
    RAISE EXCEPTION 'questions with NULL subject_id exist — assign subjects before migrating';
  END IF;
END $$;

ALTER TABLE questions ALTER COLUMN subject_id SET NOT NULL;

-- Re-create FK as RESTRICT (was ON DELETE SET NULL, which would now violate
-- NOT NULL anyway). DROP + ADD pair keeps the migration re-runnable.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_subject_id_fkey;
ALTER TABLE questions ADD CONSTRAINT questions_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;

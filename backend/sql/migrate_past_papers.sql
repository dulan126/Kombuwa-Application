-- ═══════════════════════════════════════════════════════════════════
-- Migration: Past Papers (interactive MCQ practice + two reference PDFs)
--
-- A past paper is a papers row with type='pastpaper' — reusing the exam
-- engine, question pool, images and subject cards. It differs from Daily/SRP
-- in two ways handled by new tables here:
--   • practice_attempts — MANY attempts per (user, paper), elapsed-time.
--   • paper_media       — the two reference PDFs (structured + essay).
--
-- Apply manually (ALTER TYPE ADD VALUE cannot run inside a txn block):
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/migrate_past_papers.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE paper_type ADD VALUE IF NOT EXISTS 'pastpaper';

-- Two reference PDFs per past paper (sparse; mirrors question_media).
-- storage_key is an opaque key resolved by the storage layer.
CREATE TABLE IF NOT EXISTS paper_media (
  id          SERIAL      PRIMARY KEY,
  paper_id    UUID        NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  slot        TEXT        NOT NULL CHECK (slot IN ('structured','essay')),
  storage_key TEXT        NOT NULL,
  mime        TEXT        NOT NULL,
  size_bytes  INT         NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (paper_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_paper_media_paper ON paper_media(paper_id);

-- Multi-attempt, elapsed-time practice history. Deliberately NO
-- UNIQUE(user_id, paper_id): a student may attempt a past paper many times.
CREATE TABLE IF NOT EXISTS practice_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id),
  paper_id        UUID        NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  score           SMALLINT    NOT NULL DEFAULT 0,
  total_questions SMALLINT    NOT NULL,
  answers         JSONB       NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ,
  time_taken_secs INT,
  is_completed    BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_user_paper
  ON practice_attempts(user_id, paper_id, submitted_at DESC NULLS LAST);

-- ═══════════════════════════════════════════════════════════════════
-- Migration: Question & answer images (sparse question_media table)
-- One row per present image, keyed by (question_id, slot) where slot is
-- the question stem or an option A/B/C/D. Rows only exist when an image
-- is set — no wasted columns. storage_key is an opaque private key.
--
-- Apply manually:
--   docker exec -i backend-postgres-1 psql -U miedvance_user -d miedvance \
--     < backend/sql/migrate_question_media.sql
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS question_media (
  id          SERIAL      PRIMARY KEY,
  question_id INTEGER     NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  slot        TEXT        NOT NULL CHECK (slot IN ('question','a','b','c','d')),
  storage_key TEXT        NOT NULL,
  mime        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_question_media_question ON question_media(question_id);

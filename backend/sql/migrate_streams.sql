-- ═══════════════════════════════════════════════════════════════════
-- Migration: Dynamic Streams & Subjects (many-to-many)
-- Run this ONCE against the database.
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Create streams table
CREATE TABLE IF NOT EXISTS streams (
  id         VARCHAR(20)   PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  icon       VARCHAR(20)   NOT NULL DEFAULT '📚',
  color      VARCHAR(20)   NOT NULL DEFAULT '#8b90f0',
  sort_order SMALLINT      NOT NULL DEFAULT 0
);

-- Step 2: Seed existing stream enum values into the new table
INSERT INTO streams (id, name, icon, color, sort_order) VALUES
  ('phy', 'Physical Science', '⚗️',  '#4F7FE8', 1),
  ('bio', 'Bio Science',      '🧬',  '#3DAF72', 2),
  ('com', 'Commerce',         '📊',  '#8b90f0', 3),
  ('art', 'Arts',             '🎨',  '#A78BFA', 4),
  ('tec', 'Technology',       '💻',  '#2EC4B6', 5)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create stream_subjects join table (many-to-many)
CREATE TABLE IF NOT EXISTS stream_subjects (
  stream_id  VARCHAR(20) NOT NULL REFERENCES streams(id)  ON DELETE CASCADE,
  subject_id VARCHAR(10) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (stream_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_stream_subjects_stream  ON stream_subjects(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_subjects_subject ON stream_subjects(subject_id);

-- Step 4: Migrate existing single-stream data from subjects.stream into join table
INSERT INTO stream_subjects (stream_id, subject_id, sort_order)
SELECT stream::TEXT, id, sort_order FROM subjects
ON CONFLICT (stream_id, subject_id) DO NOTHING;

-- Step 5: Drop the now-redundant columns from subjects
ALTER TABLE subjects DROP COLUMN IF EXISTS stream;
ALTER TABLE subjects DROP COLUMN IF EXISTS sort_order;


-- docker compose cp sql/migrate_streams.sql postgres:/tmp/migrate_streams.sql                                                                                          
-- >> docker compose exec postgres psql -U miedvance_user -d miedvance -f /tmp/migrate_streams.sql
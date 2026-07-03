-- Admin Area Migration
-- Run in psql: \i migrate_admin.sql
-- NOTE: The ALTER TYPE statement below auto-commits; a new transaction starts after it.

-- Step 1: Add editor role (cannot run inside BEGIN/COMMIT)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'editor';

-- Step 2: Everything else
BEGIN;

-- Permissions registry
CREATE TABLE IF NOT EXISTS permissions (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role            user_role NOT NULL,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);

-- Seed permissions
INSERT INTO permissions (code, description) VALUES
  ('stats:view',       'View admin dashboard stats'),
  ('papers:create',    'Create papers'),
  ('papers:edit',      'Edit paper metadata'),
  ('papers:delete',    'Delete papers'),
  ('papers:publish',   'Publish / unpublish papers'),
  ('questions:create', 'Create questions in the pool'),
  ('questions:edit',   'Edit pool questions'),
  ('questions:delete', 'Delete questions from the pool'),
  ('users:view',       'List users'),
  ('users:manage',     'Change user roles and status'),
  ('topics:create',    'Create topics'),
  ('topics:edit',      'Edit topics'),
  ('topics:delete',    'Delete topics'),
  ('rankings:trigger', 'Trigger manual ranking recompute')
ON CONFLICT (code) DO NOTHING;

-- Admin: all permissions
INSERT INTO role_permissions (role, permission_code)
SELECT 'admin'::user_role, code FROM permissions
ON CONFLICT (role, permission_code) DO NOTHING;

-- Editor: all except delete ops + users:manage
INSERT INTO role_permissions (role, permission_code)
SELECT 'editor'::user_role, code FROM permissions
WHERE code NOT IN ('papers:delete', 'questions:delete', 'topics:delete', 'users:manage')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Extend questions table for pool model
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS slug        TEXT,
  ADD COLUMN IF NOT EXISTS subject_id  VARCHAR(10) REFERENCES subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- Backfill slugs for any existing rows
UPDATE questions SET slug = 'q-' || id WHERE slug IS NULL;

-- Create the paper-question join table
CREATE TABLE IF NOT EXISTS paper_questions (
  paper_id    UUID     NOT NULL REFERENCES papers(id)    ON DELETE CASCADE,
  question_id INTEGER  NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (paper_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_pq_paper    ON paper_questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_pq_question ON paper_questions(question_id);

-- Migrate existing 1:1 question→paper rows to the join table
INSERT INTO paper_questions (paper_id, question_id, sort_order)
SELECT paper_id, id, sort_order FROM questions
ON CONFLICT (paper_id, question_id) DO NOTHING;

-- Make slug NOT NULL and unique
UPDATE questions SET slug = 'q-' || id WHERE slug IS NULL;
ALTER TABLE questions ALTER COLUMN slug SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_questions_slug ON questions(slug);

-- Drop the old FK column and sort_order from questions (they now live in paper_questions)
DROP INDEX IF EXISTS idx_questions_paper;
ALTER TABLE questions DROP COLUMN IF EXISTS paper_id;
ALTER TABLE questions DROP COLUMN IF EXISTS sort_order;

COMMIT;

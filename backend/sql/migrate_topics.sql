-- Add topic_id to questions table so pool questions can be categorised by topic.
-- ON DELETE SET NULL: removing a topic never breaks existing questions.
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS topic_id INT REFERENCES topics(id) ON DELETE SET NULL;

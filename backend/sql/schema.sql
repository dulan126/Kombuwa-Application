-- ═══════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE stream_enum   AS ENUM ('phy','bio','com','art','tec');
  CREATE TYPE grade_enum    AS ENUM ('12','13');
  CREATE TYPE paper_type    AS ENUM ('daily','srp');
  CREATE TYPE user_role     AS ENUM ('student','teacher','admin');
  CREATE TYPE thread_status AS ENUM ('pending','resolved');
  CREATE TYPE district_enum AS ENUM (
    'colombo','gampaha','kalutara','kandy','matale','nuwara_eliya',
    'galle','matara','hambantota','jaffna','kilinochchi','mannar',
    'vavuniya','mullaitivu','batticaloa','ampara','trincomalee',
    'kurunegala','puttalam','anuradhapura','polonnaruwa','badulla',
    'moneragala','ratnapura','kegalle'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile        VARCHAR(15)   UNIQUE NOT NULL,
  name          VARCHAR(120)  NOT NULL,
  password_hash TEXT          NOT NULL,
  role          user_role     NOT NULL DEFAULT 'student',
  stream        stream_enum,
  grade         grade_enum,
  district      district_enum,
  school        VARCHAR(200),
  exam_year     SMALLINT,
  is_verified   BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_mobile   ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_stream   ON users(stream);
CREATE INDEX IF NOT EXISTS idx_users_district ON users(district);

-- ═══════════════════════════════════════════════════════════════════
-- OTP
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS otps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile      VARCHAR(15) NOT NULL,
  code        CHAR(6)     NOT NULL,
  purpose     VARCHAR(30) NOT NULL,
  attempts    SMALLINT    NOT NULL DEFAULT 0,
  verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otps_mobile ON otps(mobile);

-- ═══════════════════════════════════════════════════════════════════
-- SUBJECTS & TOPICS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subjects (
  id          VARCHAR(10)   PRIMARY KEY,
  name_si     VARCHAR(100)  NOT NULL,
  stream      stream_enum   NOT NULL,
  sort_order  SMALLINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS topics (
  id          SERIAL        PRIMARY KEY,
  subject_id  VARCHAR(10)   NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name_si     VARCHAR(200)  NOT NULL,
  sort_order  SMALLINT      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);

-- ═══════════════════════════════════════════════════════════════════
-- PAPERS (Daily MCQ + SRP)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS papers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  type            paper_type    NOT NULL,
  subject_id      VARCHAR(10)   NOT NULL REFERENCES subjects(id),
  grade           grade_enum    NOT NULL,
  title           VARCHAR(300)  NOT NULL,
  question_count  SMALLINT      NOT NULL,
  time_seconds    INT           NOT NULL,
  available_from  TIMESTAMPTZ   NOT NULL,
  available_until TIMESTAMPTZ,
  ms_available    BOOLEAN       NOT NULL DEFAULT FALSE,
  ms_available_at TIMESTAMPTZ,
  is_published    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_papers_type_subj  ON papers(type, subject_id);
CREATE INDEX IF NOT EXISTS idx_papers_grade      ON papers(grade);
CREATE INDEX IF NOT EXISTS idx_papers_avail_from ON papers(available_from);

-- ═══════════════════════════════════════════════════════════════════
-- QUESTIONS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS questions (
  id              SERIAL        PRIMARY KEY,
  paper_id        UUID          NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  sort_order      SMALLINT      NOT NULL,
  question_text   TEXT          NOT NULL,
  option_a        TEXT          NOT NULL,
  option_b        TEXT          NOT NULL,
  option_c        TEXT          NOT NULL,
  option_d        TEXT          NOT NULL,
  correct_option  CHAR(1)       NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation     TEXT,
  image_url       TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_paper ON questions(paper_id, sort_order);

-- ═══════════════════════════════════════════════════════════════════
-- STUDENT ATTEMPTS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attempts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id),
  paper_id        UUID          NOT NULL REFERENCES papers(id),
  score           SMALLINT      NOT NULL DEFAULT 0,
  total_questions SMALLINT      NOT NULL,
  answers         JSONB         NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ,
  time_taken_secs INT,
  is_completed    BOOLEAN       NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, paper_id)
);
CREATE INDEX IF NOT EXISTS idx_attempts_user  ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_paper ON attempts(paper_id);
CREATE INDEX IF NOT EXISTS idx_attempts_score ON attempts(paper_id, score DESC, time_taken_secs ASC);

-- ═══════════════════════════════════════════════════════════════════
-- RANKINGS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rankings (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id        UUID          NOT NULL REFERENCES papers(id),
  user_id         UUID          NOT NULL REFERENCES users(id),
  score           SMALLINT      NOT NULL,
  time_taken_secs INT           NOT NULL,
  national_rank   INT,
  district_rank   INT,
  district        district_enum,
  computed_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (paper_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_rankings_paper      ON rankings(paper_id, national_rank);
CREATE INDEX IF NOT EXISTS idx_rankings_paper_dist ON rankings(paper_id, district, district_rank);

-- ═══════════════════════════════════════════════════════════════════
-- PAST PAPERS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS past_papers (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id               VARCHAR(10) NOT NULL REFERENCES subjects(id),
  topic_id                 INT         NOT NULL REFERENCES topics(id),
  year                     SMALLINT    NOT NULL,
  grade                    grade_enum  NOT NULL,
  mcq_count                SMALLINT    NOT NULL DEFAULT 0,
  essay_count              SMALLINT    NOT NULL DEFAULT 0,
  mcq_marks                SMALLINT    NOT NULL DEFAULT 0,
  essay_marks              SMALLINT    NOT NULL DEFAULT 0,
  essay_pdf_url            TEXT,
  essay_pdf_size           INT,
  marking_scheme_available BOOLEAN     NOT NULL DEFAULT FALSE,
  ms_mcq_uploaded          BOOLEAN     NOT NULL DEFAULT FALSE,
  ms_essay_pdf_url         TEXT,
  ms_essay_pdf_size        INT,
  uploaded_by              UUID        REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, topic_id, year, grade)
);
CREATE INDEX IF NOT EXISTS idx_pp_subject_topic ON past_papers(subject_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_pp_year          ON past_papers(year);

-- ═══════════════════════════════════════════════════════════════════
-- PAST PAPER MCQ QUESTIONS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pp_questions (
  id            SERIAL      PRIMARY KEY,
  past_paper_id UUID        NOT NULL REFERENCES past_papers(id) ON DELETE CASCADE,
  sort_order    SMALLINT    NOT NULL,
  question_text TEXT        NOT NULL,
  option_a      TEXT        NOT NULL,
  option_b      TEXT        NOT NULL,
  option_c      TEXT        NOT NULL,
  option_d      TEXT        NOT NULL,
  correct_option CHAR(1)    CHECK (correct_option IN ('A','B','C','D')),
  image_url     TEXT
);
CREATE INDEX IF NOT EXISTS idx_pp_questions_paper ON pp_questions(past_paper_id, sort_order);

-- ═══════════════════════════════════════════════════════════════════
-- PAST PAPER ESSAY QUESTIONS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pp_essays (
  id            SERIAL      PRIMARY KEY,
  past_paper_id UUID        NOT NULL REFERENCES past_papers(id) ON DELETE CASCADE,
  sort_order    SMALLINT    NOT NULL,
  question_text TEXT        NOT NULL,
  marks         SMALLINT    NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════════════
-- Q&A FORUM
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS forum_threads (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id),
  subject_id  VARCHAR(10)   NOT NULL REFERENCES subjects(id),
  title       VARCHAR(400)  NOT NULL,
  body        TEXT          NOT NULL,
  image_urls  TEXT[]        NOT NULL DEFAULT '{}',
  status      thread_status NOT NULL DEFAULT 'pending',
  view_count  INT           NOT NULL DEFAULT 0,
  reply_count INT           NOT NULL DEFAULT 0,
  is_deleted  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_threads_subject ON forum_threads(subject_id);
CREATE INDEX IF NOT EXISTS idx_threads_status  ON forum_threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_user    ON forum_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_created ON forum_threads(created_at DESC);

CREATE TABLE IF NOT EXISTS forum_replies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID        NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id),
  body        TEXT        NOT NULL,
  is_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_by UUID        REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_replies_thread ON forum_replies(thread_id, created_at);

-- ═══════════════════════════════════════════════════════════════════
-- AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   TEXT,
  meta        JSONB,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ═══════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['users','papers','forum_threads']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t,t,t,t);
  END LOOP;
END $$;

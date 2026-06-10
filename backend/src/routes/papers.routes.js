'use strict';
const router = require('express').Router();
const { param, query, body } = require('express-validator');
const db     = require('../config/db');
const redis  = require('../config/redis');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { computeRankings, getLeaderboard, getStudentRank } = require('../services/ranking.service');

// ── GET /papers ───────────────────────────────────────────────────────
// Returns paper cards for the student's stream/grade (no questions, no answers)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { type, subject, grade } = req.query;
    const now = new Date();

    const params  = [];
    const wheres  = ['p.is_published = TRUE', 'p.available_from <= $1'];
    params.push(now);

    if (type)    { params.push(type);    wheres.push(`p.type = $${params.length}::paper_type`); }
    if (subject) { params.push(subject); wheres.push(`p.subject_id = $${params.length}`); }
    if (grade)   { params.push(grade);   wheres.push(`p.grade = $${params.length}::grade_enum`); }

    const { rows } = await db.query(
      `SELECT
         p.id, p.type, p.subject_id, p.grade, p.title,
         p.question_count, p.time_seconds,
         p.available_from, p.available_until,
         p.ms_available, p.ms_available_at,
         s.name_si AS subject_name,
         -- Student's attempt status
         a.is_completed AS done,
         a.score,
         a.submitted_at
       FROM papers p
       JOIN subjects s ON s.id = p.subject_id
       LEFT JOIN attempts a ON a.paper_id = p.id AND a.user_id = $2
       WHERE ${wheres.join(' AND ')}
       ORDER BY p.type DESC, p.available_from DESC`,
      [now, req.user.id, ...params.slice(1)]
    );

    // Fix param indices: rebuild properly
    const p2 = [now, req.user.id];
    const w2 = ['p.is_published = TRUE', 'p.available_from <= $1'];
    if (type)    { p2.push(type);    w2.push(`p.type = $${p2.length}::paper_type`); }
    if (subject) { p2.push(subject); w2.push(`p.subject_id = $${p2.length}`); }
    if (grade)   { p2.push(grade);   w2.push(`p.grade = $${p2.length}::grade_enum`); }

    const { rows: r2 } = await db.query(
      `SELECT p.id, p.type, p.subject_id, p.grade, p.title,
         p.question_count, p.time_seconds,
         p.available_from, p.available_until,
         p.ms_available, p.ms_available_at,
         s.name_si AS subject_name,
         a.is_completed AS done, a.score, a.submitted_at
       FROM papers p
       JOIN subjects s ON s.id = p.subject_id
       LEFT JOIN attempts a ON a.paper_id = p.id AND a.user_id = $2
       WHERE ${w2.join(' AND ')}
       ORDER BY p.type DESC, p.available_from DESC`,
      p2
    );

    res.json(r2);
  } catch (err) { next(err); }
});

// ── GET /papers/:id/questions ─────────────────────────────────────────
// Returns questions WITHOUT correct answers (served at exam start)
router.get('/:id/questions',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check paper exists and is accessible
      const { rows: papers } = await db.query(
        `SELECT p.*, s.name_si AS subject_name
         FROM papers p JOIN subjects s ON s.id = p.subject_id
         WHERE p.id = $1 AND p.is_published = TRUE`,
        [id]
      );
      if (!papers.length) return res.status(404).json({ error: 'Paper not found' });
      const paper = papers[0];

      // SRP: check within window
      const now = new Date();
      if (paper.type === 'srp' && paper.available_until && now > new Date(paper.available_until)) {
        return res.status(403).json({ error: 'SRP window has closed' });
      }

      // One-attempt check
      const { rows: existing } = await db.query(
        'SELECT id, is_completed FROM attempts WHERE paper_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (existing.length && existing[0].is_completed) {
        return res.status(403).json({ error: 'Already attempted', attemptId: existing[0].id });
      }

      // Create attempt record if not exists
      if (!existing.length) {
        await db.query(
          `INSERT INTO attempts (user_id, paper_id, total_questions, started_at)
           VALUES ($1,$2,$3,NOW())
           ON CONFLICT (user_id, paper_id) DO NOTHING`,
          [req.user.id, id, paper.question_count]
        );
      }

      // Return questions WITHOUT correct_option
      const { rows: qs } = await db.query(
        `SELECT id, sort_order, question_text, option_a, option_b, option_c, option_d, image_url
         FROM questions WHERE paper_id = $1 ORDER BY sort_order`,
        [id]
      );

      res.json({
        paper: {
          id: paper.id, type: paper.type, title: paper.title,
          subject_id: paper.subject_id, subject_name: paper.subject_name,
          grade: paper.grade, time_seconds: paper.time_seconds,
          question_count: paper.question_count,
          available_until: paper.available_until,
        },
        questions: qs,
      });
    } catch (err) { next(err); }
  }
);

// ── POST /papers/:id/submit ───────────────────────────────────────────
// Accepts answers, scores server-side, returns score + rank
router.post('/:id/submit',
  authenticate,
  [
    param('id').isUUID(),
    body('answers').isObject().withMessage('answers must be a key:value object {"0":"A","1":"B",...}'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { id }     = req.params;
      const { answers} = req.body;  // { "0": "A", "1": "C", ... }

      // Fetch attempt
      const { rows: atts } = await db.query(
        'SELECT id, is_completed, started_at FROM attempts WHERE paper_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (!atts.length) return res.status(400).json({ error: 'No active attempt found' });
      if (atts[0].is_completed) return res.status(409).json({ error: 'Already submitted' });

      // Fetch correct answers from DB (server-side scoring only)
      const { rows: qs } = await db.query(
        'SELECT sort_order, correct_option FROM questions WHERE paper_id = $1 ORDER BY sort_order',
        [id]
      );

      let score = 0;
      qs.forEach((q) => {
        const studentAnswer = (answers[String(q.sort_order - 1)] || '').toUpperCase();
        if (studentAnswer === q.correct_option) score++;
      });

      const timeTaken = Math.floor((Date.now() - new Date(atts[0].started_at).getTime()) / 1000);

      await db.query(
        `UPDATE attempts SET
           score = $1, answers = $2, submitted_at = NOW(),
           time_taken_secs = $3, is_completed = TRUE
         WHERE id = $4`,
        [score, JSON.stringify(answers), timeTaken, atts[0].id]
      );

      // Compute rankings asynchronously (don't await — respond fast)
      computeRankings(id).catch((err) => console.error('Rank compute error:', err));

      // Fetch instant rank estimate from Redis sorted set (or DB if available)
      const rankData = await getStudentRank(id, req.user.id);

      res.json({
        score,
        total: qs.length,
        percentage: Math.round(score / qs.length * 100),
        timeTakenSecs: timeTaken,
        rank: rankData,
      });
    } catch (err) { next(err); }
  }
);

// ── GET /papers/:id/marking-scheme ────────────────────────────────────
// Returns correct answers — only if ms_available = TRUE
router.get('/:id/marking-scheme',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { rows: papers } = await db.query(
        'SELECT id, ms_available, type FROM papers WHERE id = $1', [req.params.id]
      );
      if (!papers.length) return res.status(404).json({ error: 'Paper not found' });
      if (!papers[0].ms_available) {
        return res.status(403).json({ error: 'Marking scheme not yet available', msAvailable: false });
      }

      // Must have attempted
      const { rows: atts } = await db.query(
        'SELECT id, answers, score, total_questions FROM attempts WHERE paper_id = $1 AND user_id = $2 AND is_completed = TRUE',
        [req.params.id, req.user.id]
      );

      const { rows: qs } = await db.query(
        `SELECT sort_order, question_text, option_a, option_b, option_c, option_d,
                correct_option, explanation, image_url
         FROM questions WHERE paper_id = $1 ORDER BY sort_order`,
        [req.params.id]
      );

      const studentAnswers = atts.length ? atts[0].answers : {};

      res.json({
        questions: qs.map((q, i) => ({
          ...q,
          studentAnswer: studentAnswers[String(i)] || null,
        })),
        studentScore: atts.length ? atts[0].score : null,
        totalQuestions: qs.length,
      });
    } catch (err) { next(err); }
  }
);

// ── GET /papers/:id/rankings ──────────────────────────────────────────
router.get('/:id/rankings',
  authenticate,
  [
    param('id').isUUID(),
    query('district').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { district, page = 1, limit = 50 } = req.query;
      const [lb, myRank] = await Promise.all([
        getLeaderboard(req.params.id, { district, page: parseInt(page), limit: parseInt(limit) }),
        getStudentRank(req.params.id, req.user.id),
      ]);
      res.json({ ...lb, myRank });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════════════
// ADMIN: Create paper + upload questions
// ══════════════════════════════════════════════════════════════════════
router.post('/',
  authenticate, requireRole('admin'),
  [
    body('type').isIn(['daily','srp']),
    body('subject_id').notEmpty(),
    body('grade').isIn(['12','13']),
    body('title').trim().isLength({ min: 3, max: 300 }),
    body('time_seconds').isInt({ min: 300, max: 5400 }),
    body('available_from').isISO8601(),
    body('available_until').optional().isISO8601(),
    body('questions').isArray({ min: 1, max: 50 }),
    body('questions.*.question_text').notEmpty(),
    body('questions.*.option_a').notEmpty(),
    body('questions.*.option_b').notEmpty(),
    body('questions.*.option_c').notEmpty(),
    body('questions.*.option_d').notEmpty(),
    body('questions.*.correct_option').isIn(['A','B','C','D']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { type, subject_id, grade, title, time_seconds, available_from, available_until, questions } = req.body;

      // Enforce question counts
      if (type === 'daily' && questions.length !== 10) {
        return res.status(422).json({ error: 'Daily MCQ must have exactly 10 questions' });
      }
      if (type === 'srp' && questions.length !== 30) {
        return res.status(422).json({ error: 'SRP must have exactly 30 questions' });
      }

      await db.transaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO papers (type, subject_id, grade, title, question_count, time_seconds,
                               available_from, available_until, is_published, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9) RETURNING id`,
          [type, subject_id, grade, title, questions.length, time_seconds,
           available_from, available_until || null, req.user.id]
        );
        const paperId = rows[0].id;

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          await client.query(
            `INSERT INTO questions (paper_id, sort_order, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [paperId, i + 1, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation || null]
          );
        }
        res.status(201).json({ id: paperId, message: 'Paper created' });
      });
    } catch (err) { next(err); }
  }
);

// ADMIN: Upload marking scheme (flip ms_available flag)
router.patch('/:id/marking-scheme',
  authenticate, requireRole('admin'),
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      await db.query(
        'UPDATE papers SET ms_available = TRUE, ms_available_at = NOW() WHERE id = $1',
        [req.params.id]
      );
      await redis.del(`ms:${req.params.id}`);
      res.json({ message: 'Marking scheme now available' });
    } catch (err) { next(err); }
  }
);

module.exports = router;

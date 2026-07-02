'use strict';
const router = require('express').Router();
const { body, query } = require('express-validator');
const db     = require('../config/db');
const redis  = require('../config/redis');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { computeRankings } = require('../services/ranking.service');

const adminOnly = [authenticate, requireRole('admin')];

// ── GET /admin/stats ──────────────────────────────────────────────────
router.get('/stats', ...adminOnly, async (req, res, next) => {
  try {
    const [users, papers, attempts, threads] = await Promise.all([
      db.query('SELECT COUNT(*) FROM users WHERE role = $1', ['student']),
      db.query('SELECT COUNT(*) FROM papers WHERE is_published = TRUE'),
      db.query('SELECT COUNT(*) FROM attempts WHERE is_completed = TRUE'),
      db.query('SELECT COUNT(*) FROM forum_threads'),
    ]);
    const [dau, wau] = await Promise.all([
      db.query(`SELECT COUNT(DISTINCT user_id) FROM attempts WHERE submitted_at > NOW() - INTERVAL '1 day'`),
      db.query(`SELECT COUNT(DISTINCT user_id) FROM attempts WHERE submitted_at > NOW() - INTERVAL '7 days'`),
    ]);
    const { rows: topSubjects } = await db.query(
      `SELECT subject_id, COUNT(*) AS cnt FROM forum_threads
       GROUP BY subject_id ORDER BY cnt DESC LIMIT 5`
    );
    res.json({
      totalStudents:    parseInt(users.rows[0].count),
      totalPapers:      parseInt(papers.rows[0].count),
      totalAttempts:    parseInt(attempts.rows[0].count),
      totalThreads:     parseInt(threads.rows[0].count),
      dau:              parseInt(dau.rows[0].count),
      wau:              parseInt(wau.rows[0].count),
      topForumSubjects: topSubjects,
    });
  } catch (err) { next(err); }
});

// ── GET /admin/papers ─────────────────────────────────────────────────
router.get('/papers', ...adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.type, p.subject_id, p.grade, p.title,
              p.question_count, p.is_published, p.ms_available,
              p.available_from, p.available_until, p.created_at,
              s.name_si AS subject_name,
              COUNT(a.id) AS attempt_count
       FROM papers p
       JOIN subjects s ON s.id = p.subject_id
       LEFT JOIN attempts a ON a.paper_id = p.id AND a.is_completed = TRUE
       GROUP BY p.id, s.name_si
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PATCH /admin/papers/:id/publish ──────────────────────────────────
router.patch('/papers/:id/publish', ...adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'UPDATE papers SET is_published = $1 WHERE id = $2 RETURNING id, is_published',
      [req.body.publish !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Paper not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /admin/papers/:id/trigger-rankings ──────────────────────────
router.post('/papers/:id/trigger-rankings', ...adminOnly, async (req, res, next) => {
  try {
    await computeRankings(req.params.id);
    res.json({ message: 'Rankings computed' });
  } catch (err) { next(err); }
});

// ── GET /admin/users ──────────────────────────────────────────────────
router.get('/users', ...adminOnly,
  [query('stream').optional(), query('grade').optional(), query('page').optional().isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const { stream, grade, page = 1 } = req.query;
      const offset = (parseInt(page) - 1) * 50;
      const params = [50, offset];
      const wheres = ["role = 'student'"];
      if (stream) { params.unshift(stream); wheres.push(`stream = $${params.indexOf(stream) + 1}::stream_enum`); }
      if (grade)  { params.unshift(grade);  wheres.push(`grade = $${params.indexOf(grade) + 1}::grade_enum`); }
      const limitIdx  = params.length - 1;
      const offsetIdx = params.length;
      const { rows } = await db.query(
        `SELECT id, name, mobile, stream, grade, district, school, exam_year, created_at, last_login
         FROM users WHERE ${wheres.join(' AND ')}
         ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// ── GET /admin/subjects ───────────────────────────────────────────────
router.get('/subjects', ...adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, array_agg(json_build_object('id',t.id,'name',t.name_si,'order',t.sort_order)
         ORDER BY t.sort_order) AS topics
       FROM subjects s LEFT JOIN topics t ON t.subject_id = s.id
       GROUP BY s.id ORDER BY s.stream, s.sort_order`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /admin/topics ────────────────────────────────────────────────
router.post('/topics', ...adminOnly,
  [body('subject_id').notEmpty(), body('name_si').trim().isLength({ min: 2, max: 200 })],
  validate,
  async (req, res, next) => {
    try {
      const { rows } = await db.query(
        'INSERT INTO topics (subject_id, name_si) VALUES ($1,$2) RETURNING id',
        [req.body.subject_id, req.body.name_si]
      );
      res.status(201).json(rows[0]);
    } catch (err) { next(err); }
  }
);

module.exports = router;

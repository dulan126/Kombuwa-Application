'use strict';
const router = require('express').Router();
const { param, query, body } = require('express-validator');
const db     = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { forumImages, uploadWrap } = require('../middleware/upload');

// ── GET /forum/threads ────────────────────────────────────────────────
router.get('/threads',
  authenticate,
  [
    query('subject').optional().isString(),
    query('status').optional().isIn(['pending','resolved']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { subject, status, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const params = [];
      const wheres = ['t.is_deleted = FALSE'];
      if (subject) { params.push(subject); wheres.push(`t.subject_id = $${params.length}`); }
      if (status)  { params.push(status);  wheres.push(`t.status = $${params.length}::thread_status`); }

      params.push(parseInt(limit), offset);
      const { rows } = await db.query(
        `SELECT t.id, t.subject_id, t.title, t.status, t.view_count, t.reply_count,
                t.image_urls, t.created_at,
                u.name AS author_name, u.role AS author_role,
                s.name_si AS subject_name
         FROM forum_threads t
         JOIN users u    ON u.id = t.user_id
         JOIN subjects s ON s.id = t.subject_id
         WHERE ${wheres.join(' AND ')}
         ORDER BY t.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const { rows: total } = await db.query(
        `SELECT COUNT(*) FROM forum_threads t
         WHERE ${wheres.join(' AND ')}`,
        params.slice(0, -2)
      );

      res.json({ threads: rows, total: parseInt(total[0].count) });
    } catch (err) { next(err); }
  }
);

// ── GET /forum/threads/:id ────────────────────────────────────────────
router.get('/threads/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { rows: threads } = await db.query(
        `SELECT t.*, u.name AS author_name, u.role AS author_role, s.name_si AS subject_name
         FROM forum_threads t
         JOIN users u ON u.id = t.user_id
         JOIN subjects s ON s.id = t.subject_id
         WHERE t.id = $1 AND t.is_deleted = FALSE`,
        [req.params.id]
      );
      if (!threads.length) return res.status(404).json({ error: 'Thread not found' });

      // Increment view count
      await db.query('UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);

      const { rows: replies } = await db.query(
        `SELECT r.id, r.body, r.is_verified, r.created_at,
                u.id AS user_id, u.name, u.role,
                vu.name AS verified_by_name
         FROM forum_replies r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN users vu ON vu.id = r.verified_by
         WHERE r.thread_id = $1 AND r.is_deleted = FALSE
         ORDER BY r.is_verified DESC, r.created_at ASC`,
        [req.params.id]
      );

      res.json({ thread: threads[0], replies });
    } catch (err) { next(err); }
  }
);

// ── POST /forum/threads ───────────────────────────────────────────────
router.post('/threads',
  authenticate,
  uploadWrap(forumImages),
  [
    body('subject_id').notEmpty(),
    body('title').trim().isLength({ min: 10, max: 400 }),
    body('body').trim().isLength({ min: 20 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { subject_id, title, body: bodyText } = req.body;
      const imageUrls = (req.files || []).map((f) => `/uploads/forum-images/${f.filename}`);

      const { rows } = await db.query(
        `INSERT INTO forum_threads (user_id, subject_id, title, body, image_urls)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
        [req.user.id, subject_id, title, bodyText, imageUrls]
      );
      res.status(201).json({ id: rows[0].id, createdAt: rows[0].created_at });
    } catch (err) { next(err); }
  }
);

// ── POST /forum/threads/:id/replies ───────────────────────────────────
router.post('/threads/:id/replies',
  authenticate,
  [
    param('id').isUUID(),
    body('body').trim().isLength({ min: 5 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      await db.transaction(async (client) => {
        const { rows } = await client.query(
          'INSERT INTO forum_replies (thread_id, user_id, body) VALUES ($1,$2,$3) RETURNING id, created_at',
          [req.params.id, req.user.id, req.body.body]
        );
        await client.query(
          'UPDATE forum_threads SET reply_count = reply_count + 1, updated_at = NOW() WHERE id = $1',
          [req.params.id]
        );
        res.status(201).json({ id: rows[0].id, createdAt: rows[0].created_at });
      });
    } catch (err) { next(err); }
  }
);

// ── PATCH /forum/replies/:id/verify ──────────────────────────────────
// Teacher or admin marks a reply as verified
router.patch('/replies/:id/verify',
  authenticate,
  requireRole('teacher', 'admin'),
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { rows: reply } = await db.query(
        'SELECT thread_id FROM forum_replies WHERE id = $1', [req.params.id]
      );
      if (!reply.length) return res.status(404).json({ error: 'Reply not found' });

      await db.transaction(async (client) => {
        // Unverify any previously verified reply in same thread
        await client.query(
          'UPDATE forum_replies SET is_verified = FALSE, verified_by = NULL, verified_at = NULL WHERE thread_id = $1',
          [reply[0].thread_id]
        );
        await client.query(
          `UPDATE forum_replies SET is_verified = TRUE, verified_by = $1, verified_at = NOW()
           WHERE id = $2`,
          [req.user.id, req.params.id]
        );
        await client.query(
          "UPDATE forum_threads SET status = 'resolved', updated_at = NOW() WHERE id = $1",
          [reply[0].thread_id]
        );
      });
      res.json({ message: 'Reply verified, thread resolved' });
    } catch (err) { next(err); }
  }
);

module.exports = router;

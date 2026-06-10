'use strict';
const router  = require('express').Router();
const path    = require('path');
const { param, query, body } = require('express-validator');
const db      = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { essayPdf, schemePdf, questionImage, uploadWrap } = require('../middleware/upload');

// ── GET /past-papers ─────────────────────────────────────────────────
// Hierarchical: Subject → Topic → Year rows
router.get('/', authenticate,
  [
    query('subject').optional().isString(),
    query('grade').optional().isIn(['12','13']),
    query('year').optional().isInt({ min: 2010, max: 2030 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { subject, grade, year } = req.query;
      const params = [];
      const wheres = [];
      if (subject) { params.push(subject); wheres.push(`pp.subject_id = $${params.length}`); }
      if (grade)   { params.push(grade);   wheres.push(`pp.grade = $${params.length}::grade_enum`); }
      if (year)    { params.push(parseInt(year)); wheres.push(`pp.year = $${params.length}`); }

      const { rows } = await db.query(
        `SELECT
           pp.id, pp.subject_id, pp.topic_id, pp.year, pp.grade,
           pp.mcq_count, pp.essay_count, pp.mcq_marks, pp.essay_marks,
           pp.marking_scheme_available, pp.ms_mcq_uploaded,
           pp.essay_pdf_url IS NOT NULL AS has_essay_pdf,
           pp.ms_essay_pdf_url IS NOT NULL AS has_ms_essay,
           s.name_si AS subject_name,
           t.name_si AS topic_name, t.sort_order AS topic_order
         FROM past_papers pp
         JOIN subjects s ON s.id = pp.subject_id
         JOIN topics t   ON t.id = pp.topic_id
         ${wheres.length ? 'WHERE ' + wheres.join(' AND ') : ''}
         ORDER BY s.name_si, t.sort_order, pp.year DESC`,
        params
      );

      // Group by subject → topic
      const tree = {};
      rows.forEach((row) => {
        if (!tree[row.subject_id]) {
          tree[row.subject_id] = { subject_id: row.subject_id, subject_name: row.subject_name, topics: {} };
        }
        const subj = tree[row.subject_id];
        if (!subj.topics[row.topic_id]) {
          subj.topics[row.topic_id] = { topic_id: row.topic_id, topic_name: row.topic_name, years: [] };
        }
        subj.topics[row.topic_id].years.push({
          id: row.id, year: row.year, grade: row.grade,
          mcqCount: row.mcq_count, essayCount: row.essay_count,
          mcqMarks: row.mcq_marks, essayMarks: row.essay_marks,
          hasEssayPdf: row.has_essay_pdf,
          markingSchemeAvailable: row.marking_scheme_available,
          msMcqUploaded: row.ms_mcq_uploaded,
          hasMsEssay: row.has_ms_essay,
        });
      });

      // Convert to arrays
      const result = Object.values(tree).map((s) => ({
        ...s,
        topics: Object.values(s.topics),
      }));

      res.json(result);
    } catch (err) { next(err); }
  }
);

// ── GET /past-papers/:id/questions ────────────────────────────────────
// MCQ questions. Correct answers hidden unless ms_mcq_uploaded = TRUE
router.get('/:id/questions',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { rows: pp } = await db.query(
        'SELECT id, ms_mcq_uploaded, subject_id, topic_id, year, grade FROM past_papers WHERE id = $1',
        [req.params.id]
      );
      if (!pp.length) return res.status(404).json({ error: 'Past paper not found' });
      const showAnswers = pp[0].ms_mcq_uploaded;

      const fields = showAnswers
        ? 'id, sort_order, question_text, option_a, option_b, option_c, option_d, correct_option, image_url'
        : 'id, sort_order, question_text, option_a, option_b, option_c, option_d, image_url';

      const { rows: qs } = await db.query(
        `SELECT ${fields} FROM pp_questions WHERE past_paper_id = $1 ORDER BY sort_order`,
        [req.params.id]
      );

      res.json({ pastPaper: pp[0], questions: qs, answersAvailable: showAnswers });
    } catch (err) { next(err); }
  }
);

// ── GET /past-papers/:id/essay-pdf ────────────────────────────────────
// Stream the essay PDF file
router.get('/:id/essay-pdf',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { rows } = await db.query(
        'SELECT essay_pdf_url, year, subject_id FROM past_papers WHERE id = $1',
        [req.params.id]
      );
      if (!rows.length || !rows[0].essay_pdf_url) {
        return res.status(404).json({ error: 'Essay PDF not available' });
      }
      const filePath = path.resolve(rows[0].essay_pdf_url);
      res.setHeader('Content-Disposition', `inline; filename="${rows[0].subject_id}_${rows[0].year}_essay.pdf"`);
      res.sendFile(filePath);
    } catch (err) { next(err); }
  }
);

// ── GET /past-papers/:id/marking-scheme-pdf ──────────────────────────
router.get('/:id/marking-scheme-pdf',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { rows } = await db.query(
        'SELECT ms_essay_pdf_url, marking_scheme_available, year, subject_id FROM past_papers WHERE id = $1',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Past paper not found' });
      if (!rows[0].marking_scheme_available || !rows[0].ms_essay_pdf_url) {
        return res.status(403).json({ error: 'Marking scheme not yet available' });
      }
      const filePath = path.resolve(rows[0].ms_essay_pdf_url);
      res.setHeader('Content-Disposition', `inline; filename="${rows[0].subject_id}_${rows[0].year}_marking_scheme.pdf"`);
      res.sendFile(filePath);
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════

// Create past paper record
router.post('/',
  authenticate, requireRole('admin'),
  [
    body('subject_id').notEmpty(),
    body('topic_id').isInt(),
    body('year').isInt({ min: 2010, max: 2030 }),
    body('grade').isIn(['12','13']),
    body('mcq_marks').isInt({ min: 0 }),
    body('essay_marks').isInt({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { subject_id, topic_id, year, grade, mcq_marks, essay_marks } = req.body;
      const { rows } = await db.query(
        `INSERT INTO past_papers (subject_id, topic_id, year, grade, mcq_marks, essay_marks, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [subject_id, topic_id, year, grade, mcq_marks, essay_marks, req.user.id]
      );
      res.status(201).json({ id: rows[0].id });
    } catch (err) { next(err); }
  }
);

// Upload essay PDF
router.post('/:id/essay-pdf',
  authenticate, requireRole('admin'),
  [param('id').isUUID()], validate,
  uploadWrap(essayPdf),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
      await db.query(
        'UPDATE past_papers SET essay_pdf_url = $1, essay_pdf_size = $2 WHERE id = $3',
        [req.file.path, req.file.size, req.params.id]
      );
      res.json({ message: 'Essay PDF uploaded', path: req.file.path });
    } catch (err) { next(err); }
  }
);

// Upload marking scheme PDF + optionally flip ms_available
router.post('/:id/marking-scheme-pdf',
  authenticate, requireRole('admin'),
  [param('id').isUUID()], validate,
  uploadWrap(schemePdf),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
      await db.query(
        `UPDATE past_papers SET
           ms_essay_pdf_url  = $1,
           ms_essay_pdf_size = $2,
           marking_scheme_available = TRUE
         WHERE id = $3`,
        [req.file.path, req.file.size, req.params.id]
      );
      res.json({ message: 'Marking scheme PDF uploaded' });
    } catch (err) { next(err); }
  }
);

// Bulk upload MCQ questions for a past paper
router.post('/:id/questions',
  authenticate, requireRole('admin'),
  [
    param('id').isUUID(),
    body('questions').isArray({ min: 1 }),
    body('questions.*.question_text').notEmpty(),
    body('questions.*.option_a').notEmpty(),
    body('questions.*.option_b').notEmpty(),
    body('questions.*.option_c').notEmpty(),
    body('questions.*.option_d').notEmpty(),
    // correct_option may be null (uploaded separately in marking scheme)
    body('questions.*.correct_option').optional().isIn(['A','B','C','D']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { questions } = req.body;
      await db.transaction(async (client) => {
        await client.query('DELETE FROM pp_questions WHERE past_paper_id = $1', [req.params.id]);
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          await client.query(
            `INSERT INTO pp_questions (past_paper_id, sort_order, question_text, option_a, option_b, option_c, option_d, correct_option)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [req.params.id, i + 1, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option || null]
          );
        }
        await client.query(
          'UPDATE past_papers SET mcq_count = $1 WHERE id = $2',
          [questions.length, req.params.id]
        );
      });
      res.json({ message: `${questions.length} questions uploaded` });
    } catch (err) { next(err); }
  }
);

// Upload MCQ answer key (correct options) — triggers ms_mcq_uploaded = TRUE
router.post('/:id/answer-key',
  authenticate, requireRole('admin'),
  [
    param('id').isUUID(),
    body('answers').isArray({ min: 1 }), // [{ sort_order:1, correct_option:'A' }, ...]
    body('answers.*.sort_order').isInt({ min: 1 }),
    body('answers.*.correct_option').isIn(['A','B','C','D']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { answers } = req.body;
      await db.transaction(async (client) => {
        for (const { sort_order, correct_option } of answers) {
          await client.query(
            'UPDATE pp_questions SET correct_option = $1 WHERE past_paper_id = $2 AND sort_order = $3',
            [correct_option, req.params.id, sort_order]
          );
        }
        await client.query(
          'UPDATE past_papers SET ms_mcq_uploaded = TRUE, marking_scheme_available = TRUE WHERE id = $1',
          [req.params.id]
        );
      });
      res.json({ message: 'Answer key uploaded' });
    } catch (err) { next(err); }
  }
);

module.exports = router;

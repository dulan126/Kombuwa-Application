'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const db     = require('../config/db');
const authSvc = require('../services/auth.service');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/errors');

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true });

// ── POST /auth/register ───────────────────────────────────────────────
// Step 1: collect details, store, send OTP
router.post('/register',
  otpLimiter,
  [
    body('mobile').matches(/^\+947[0-9]{8}$/).withMessage('Invalid Sri Lankan mobile'),
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
    body('stream').isIn(['phy','bio','com','art','tec']),
    body('grade').isIn(['12','13']),
    body('district').notEmpty(),
    body('school').optional().trim().isLength({ max: 200 }),
    body('exam_year').isInt({ min: 2025, max: 2030 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { mobile, name, password, stream, grade, district, school, exam_year } = req.body;

      // Check duplicate
      const { rows } = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
      if (rows.length) return res.status(409).json({ error: 'Mobile number already registered' });

      const hash = await authSvc.hashPassword(password);
      await db.query(
        `INSERT INTO users (id, mobile, name, password_hash, stream, grade, district, school, exam_year)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8)`,
        [mobile, name, hash, stream, grade, district, school || null, exam_year]
      );

      const expiresAt = await authSvc.createOTP(mobile, 'register');
      res.status(202).json({ message: 'OTP sent', expiresAt });
    } catch (err) { next(err); }
  }
);

// ── POST /auth/verify-otp ─────────────────────────────────────────────
router.post('/verify-otp',
  otpLimiter,
  [
    body('mobile').matches(/^\+947[0-9]{8}$/),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
    body('purpose').isIn(['register','login','reset_password']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { mobile, code, purpose } = req.body;
      await authSvc.verifyOTP(mobile, code, purpose);

      const { rows } = await db.query(
        'UPDATE users SET is_verified = TRUE WHERE mobile = $1 RETURNING id, name, role, stream, grade, district',
        [mobile]
      );
      if (!rows.length) return res.status(404).json({ error: 'User not found' });

      const tokens = authSvc.issueTokens(rows[0]);
      res.json({ message: 'Verified', user: rows[0], ...tokens });
    } catch (err) { next(err); }
  }
);

// ── POST /auth/login ──────────────────────────────────────────────────
router.post('/login',
  loginLimiter,
  [
    body('mobile').matches(/^\+947[0-9]{8}$/),
    body('password').notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { mobile, password } = req.body;
      const { rows } = await db.query(
        'SELECT id, password_hash, name, role, stream, grade, district, is_active, is_verified FROM users WHERE mobile = $1',
        [mobile]
      );
      const user = rows[0];
      const ok = user && await authSvc.checkPassword(password, user.password_hash);
      if (!ok || !user.is_active) {
        return res.status(401).json({ error: 'Invalid mobile or password' });
      }
      if (!user.is_verified) {
        // Resend OTP
        await authSvc.createOTP(mobile, 'register');
        return res.status(403).json({ error: 'Account not verified. New OTP sent.', needsVerification: true });
      }
      await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      const tokens = authSvc.issueTokens(user);
      res.json({
        user: { id: user.id, name: user.name, role: user.role, stream: user.stream, grade: user.grade, district: user.district },
        ...tokens
      });
    } catch (err) { next(err); }
  }
);

// ── POST /auth/logout ─────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authSvc.revokeToken(req.token);
    res.json({ message: 'Logged out' });
  } catch (err) { next(err); }
});

// ── POST /auth/forgot-password ────────────────────────────────────────
router.post('/forgot-password',
  otpLimiter,
  [body('mobile').matches(/^\+947[0-9]{8}$/)],
  validate,
  async (req, res, next) => {
    try {
      const { rows } = await db.query('SELECT id FROM users WHERE mobile = $1', [req.body.mobile]);
      if (!rows.length) return res.json({ message: 'If registered, OTP sent' }); // avoid enumeration
      const expiresAt = await authSvc.createOTP(req.body.mobile, 'reset_password');
      res.json({ message: 'OTP sent', expiresAt });
    } catch (err) { next(err); }
  }
);

// ── POST /auth/reset-password ─────────────────────────────────────────
router.post('/reset-password',
  [
    body('mobile').matches(/^\+947[0-9]{8}$/),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
    body('newPassword').isLength({ min: 8 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { mobile, code, newPassword } = req.body;
      await authSvc.verifyOTP(mobile, code, 'reset_password');
      const hash = await authSvc.hashPassword(newPassword);
      await db.query('UPDATE users SET password_hash = $1 WHERE mobile = $2', [hash, mobile]);
      res.json({ message: 'Password reset successful' });
    } catch (err) { next(err); }
  }
);

// ── GET /auth/me ──────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, mobile, name, role, stream, grade, district, school, exam_year, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /auth/me ────────────────────────────────────────────────────
router.patch('/me',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 2, max: 120 }),
    body('school').optional().trim().isLength({ max: 200 }),
    body('district').optional().notEmpty(),
    body('exam_year').optional().isInt({ min: 2025, max: 2030 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, school, district, exam_year } = req.body;
      const { rows } = await db.query(
        `UPDATE users SET
           name       = COALESCE($1, name),
           school     = COALESCE($2, school),
           district   = COALESCE($3::district_enum, district),
           exam_year  = COALESCE($4, exam_year)
         WHERE id = $5
         RETURNING id, name, school, district, exam_year`,
        [name, school, district, exam_year, req.user.id]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

module.exports = router;

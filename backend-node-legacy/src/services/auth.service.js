'use strict';
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db     = require('../config/db');
const redis  = require('../config/redis');
const logger = require('../utils/logger');

// ── OTP ──────────────────────────────────────────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOTP(mobile, code) {
  // Production: call Dialog Axiata / Mobitel SMS API
  // Development: log to console
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[SMS DEV] To ${mobile}: Your Kombuwaedu OTP is ${code}`);
    return;
  }
  const axios = require('axios');
  await axios.post(process.env.SMS_API_URL, {
    apiKey:    process.env.SMS_API_KEY,
    sender:    process.env.SMS_SENDER_ID || 'KOMBUWAEDU',
    to:        mobile,
    message:   `ඔබේ Kombuwaedu OTP: ${code}. ${process.env.OTP_EXPIRE_MINUTES || 5} min valid. Share with nobody.`,
  });
}

async function createOTP(mobile, purpose) {
  const cooldownKey = `otp:cd:${mobile}:${purpose}`;
  const cooldown    = await redis.exists(cooldownKey);
  if (cooldown) {
    const err = new Error('OTP resend too soon. Wait 60 seconds.'); err.status = 429; throw err;
  }

  const code    = generateOTP();
  const expires = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRE_MINUTES || '5')) * 60 * 1000);

  await db.query(
    `INSERT INTO otps (mobile, code, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [mobile, code, purpose, expires]
  );

  // Set resend cooldown
  await redis.set(cooldownKey, '1', { EX: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60') });

  await sendOTP(mobile, code);
  return expires;
}

async function verifyOTP(mobile, code, purpose) {
  const { rows } = await db.query(
    `SELECT id, attempts FROM otps
     WHERE mobile = $1 AND purpose = $2 AND verified = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [mobile, purpose]
  );
  if (!rows.length) {
    const err = new Error('OTP expired or not found'); err.status = 400; throw err;
  }
  const otp = rows[0];
  const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS || '5');
  if (otp.attempts >= maxAttempts) {
    const err = new Error('Too many incorrect attempts'); err.status = 429; throw err;
  }

  await db.query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [otp.id]);

  const { rows: check } = await db.query(
    'SELECT id FROM otps WHERE id = $1 AND code = $2', [otp.id, code]
  );
  if (!check.length) {
    const err = new Error('Incorrect OTP'); err.status = 400; throw err;
  }
  await db.query('UPDATE otps SET verified = TRUE WHERE id = $1', [otp.id]);
  return true;
}

// ── Password ──────────────────────────────────────────────────────────
async function hashPassword(plain) { return bcrypt.hash(plain, 12); }
async function checkPassword(plain, hash) { return bcrypt.compare(plain, hash); }

// ── JWT ───────────────────────────────────────────────────────────────
function issueTokens(user) {
  const payload = { sub: user.id, role: user.role };
  const access  = jwt.sign(payload, process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
  const refresh = jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });
  return { accessToken: access, refreshToken: refresh };
}

async function revokeToken(token) {
  // Decode to get expiry, store in blocklist until then
  try {
    const decoded = jwt.decode(token);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await redis.set(`bl:${token}`, '1', { EX: ttl });
  } catch (_) {}
}

module.exports = { createOTP, verifyOTP, hashPassword, checkPassword, issueTokens, revokeToken };

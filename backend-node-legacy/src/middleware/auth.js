'use strict';
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const redis  = require('../config/redis');

/**
 * Verify Bearer JWT and attach req.user.
 * Checks Redis blocklist for logged-out tokens.
 */
async function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = auth.slice(7);

    // Blocklist check (logout)
    const blocked = await redis.exists(`bl:${token}`);
    if (blocked) return res.status(401).json({ error: 'Token revoked' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user record
    const { rows } = await db.query(
      'SELECT id, mobile, name, role, stream, grade, district, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }
    req.user  = rows[0];
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    if (err.name === 'JsonWebTokenError')  return res.status(401).json({ error: 'Invalid token' });
    next(err);
  }
}

/** Require specific roles */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/** Attach user if token present, but don't block if absent */
async function optionalAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return next();
  try {
    const token = auth.slice(7);
    const blocked = await redis.exists(`bl:${token}`);
    if (blocked) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, role, stream, grade, district FROM users WHERE id = $1 AND is_active = TRUE',
      [payload.sub]
    );
    if (rows.length) req.user = rows[0];
  } catch (_) { /* ignore */ }
  next();
}

module.exports = { authenticate, requireRole, optionalAuth };

'use strict';
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/** Centralised error handler — must be last middleware */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    logger.error(err.message, { stack: err.stack, url: req.originalUrl, method: req.method });
  }

  res.status(status).json({
    error:   message,
    ...(process.env.NODE_ENV !== 'production' && status >= 500 && { stack: err.stack }),
  });
}

/** Validate express-validator results and respond 422 on failure */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
}

/** Quick 404 for unmatched routes */
function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { errorHandler, validate, notFound };

'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const db         = require('./config/db');
const redis      = require('./config/redis');
const logger     = require('./utils/logger');
const cron       = require('./services/cron.service');
const { errorHandler, notFound } = require('./middleware/errors');

const authRoutes       = require('./routes/auth.routes');
const papersRoutes     = require('./routes/papers.routes');
const pastPapersRoutes = require('./routes/pastpapers.routes');
const forumRoutes      = require('./routes/forum.routes');
const adminRoutes      = require('./routes/admin.routes');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000');

// ── Security & parsing ────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow PDF serving
}));

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ── Global rate limit ─────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Static uploads ────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  dotfiles: 'deny',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) res.setHeader('Content-Type', 'application/pdf');
  },
}));

// ── Health check ──────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/v1/auth',        authRoutes);
app.use('/api/v1/papers',      papersRoutes);
app.use('/api/v1/past-papers', pastPapersRoutes);
app.use('/api/v1/forum',       forumRoutes);
app.use('/api/v1/admin',       adminRoutes);

// ── 404 & Error ───────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────────────────
async function start() {
  try {
    await redis.connect();
    logger.info('Redis connected');

    await db.query('SELECT 1');
    logger.info('PostgreSQL connected');

    app.listen(PORT, () => {
      logger.info(`Kombuwaedu API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });

    cron.startAll();
  } catch (err) {
    logger.error('Startup failed: ' + err.message);
    process.exit(1);
  }
}

start();

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection: ' + reason));
process.on('uncaughtException',  (err)    => { logger.error('Uncaught exception: ' + err.message); process.exit(1); });

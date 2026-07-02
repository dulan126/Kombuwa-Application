'use strict';
const cron   = require('node-cron');
const db     = require('../config/db');
const { computeRankings } = require('./ranking.service');
const logger = require('../utils/logger');

/**
 * Every 5 minutes: find SRP papers whose window just closed (within last 5 min)
 * and compute their rankings.
 */
function startSRPRankingJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { rows } = await db.query(
        `SELECT id FROM papers
         WHERE type = 'srp'
           AND is_published = TRUE
           AND available_until IS NOT NULL
           AND available_until BETWEEN NOW() - INTERVAL '5 minutes' AND NOW()`,
      );
      for (const { id } of rows) {
        logger.info(`[Cron] Auto-ranking SRP paper ${id}`);
        await computeRankings(id);
      }
    } catch (err) {
      logger.error('[Cron] SRP ranking job error: ' + err.message);
    }
  });
  logger.info('[Cron] SRP ranking scheduler started (every 5 min)');
}

/**
 * Midnight SLST (UTC+5:30 → UTC 18:30 prev day): mark yesterday's papers
 * ms_available = TRUE if their available_from was today.
 */
function startMarkingSchemeJob() {
  // 18:30 UTC = midnight SLST
  cron.schedule('30 18 * * *', async () => {
    try {
      const { rows } = await db.query(
        `UPDATE papers
         SET ms_available = TRUE, ms_available_at = NOW()
         WHERE ms_available = FALSE
           AND available_from::date = (NOW() AT TIME ZONE 'Asia/Colombo')::date - INTERVAL '1 day'
           AND is_published = TRUE
         RETURNING id, title`,
      );
      if (rows.length > 0) {
        logger.info(`[Cron] Marking schemes released for ${rows.length} papers: ${rows.map(r => r.id).join(', ')}`);
      }
    } catch (err) {
      logger.error('[Cron] Marking scheme job error: ' + err.message);
    }
  });
  logger.info('[Cron] Marking scheme scheduler started (midnight SLST)');
}

/**
 * Daily at 01:00 UTC: clean up expired OTPs
 */
function startOTPCleanupJob() {
  cron.schedule('0 1 * * *', async () => {
    try {
      const { rowCount } = await db.query(
        'DELETE FROM otps WHERE expires_at < NOW() - INTERVAL \'1 hour\''
      );
      logger.info(`[Cron] Cleaned ${rowCount} expired OTPs`);
    } catch (err) {
      logger.error('[Cron] OTP cleanup error: ' + err.message);
    }
  });
}

function startAll() {
  startSRPRankingJob();
  startMarkingSchemeJob();
  startOTPCleanupJob();
}

module.exports = { startAll };

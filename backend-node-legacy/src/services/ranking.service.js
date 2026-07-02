'use strict';
const db     = require('../config/db');
const redis  = require('../config/redis');
const logger = require('../utils/logger');

const LB_TTL = 300; // cache leaderboard for 5 minutes

/**
 * Compute national + district ranks for all attempts on a paper
 * and write to the rankings table.
 * Called by cron after SRP window closes, or on-demand after daily submission.
 */
async function computeRankings(paperId) {
  logger.info(`Computing rankings for paper ${paperId}`);
  await db.transaction(async (client) => {
    // Delete old rankings for this paper
    await client.query('DELETE FROM rankings WHERE paper_id = $1', [paperId]);

    // Fetch all completed attempts ordered by score desc, time asc
    const { rows: attempts } = await client.query(
      `SELECT a.id, a.user_id, a.score, a.time_taken_secs, u.district
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       WHERE a.paper_id = $1 AND a.is_completed = TRUE
       ORDER BY a.score DESC, a.time_taken_secs ASC`,
      [paperId]
    );

    // National rank = row index + 1
    // District rank = within same district, same ordering
    const districtCounters = {};
    for (let i = 0; i < attempts.length; i++) {
      const a   = attempts[i];
      const nat = i + 1;
      const dist = a.district || 'unknown';
      districtCounters[dist] = (districtCounters[dist] || 0) + 1;
      const distRank = districtCounters[dist];

      await client.query(
        `INSERT INTO rankings (paper_id, user_id, score, time_taken_secs, national_rank, district_rank, district)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (paper_id, user_id) DO UPDATE
         SET score=$3, time_taken_secs=$4, national_rank=$5, district_rank=$6, computed_at=NOW()`,
        [paperId, a.user_id, a.score, a.time_taken_secs, nat, distRank, a.district]
      );
    }
  });

  // Invalidate leaderboard cache
  await redis.del(`lb:${paperId}`);
  await redis.del(`lb:${paperId}:*`);
  logger.info(`Rankings computed for paper ${paperId}`);
}

/**
 * Get top N leaderboard for a paper, optionally filtered by district.
 * Returns from Redis cache if available.
 */
async function getLeaderboard(paperId, { district, page = 1, limit = 50 } = {}) {
  const cacheKey = `lb:${paperId}:${district || 'all'}:${page}:${limit}`;
  const cached   = await redis.getJSON(cacheKey);
  if (cached) return cached;

  const offset = (page - 1) * limit;
  const params  = [paperId, limit, offset];
  const distWhere = district ? 'AND r.district = $4' : '';
  if (district) params.push(district);

  const { rows } = await db.query(
    `SELECT
       r.national_rank, r.district_rank, r.score, r.time_taken_secs, r.district,
       u.name, u.school,
       r.paper_id
     FROM rankings r
     JOIN users u ON u.id = r.user_id
     WHERE r.paper_id = $1 ${distWhere}
     ORDER BY r.national_rank ASC
     LIMIT $2 OFFSET $3`,
    params
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*) FROM rankings WHERE paper_id = $1 ${district ? 'AND district = $2' : ''}`,
    district ? [paperId, district] : [paperId]
  );

  const result = { rows, total: parseInt(countRows[0].count) };
  await redis.setJSON(cacheKey, result, LB_TTL);
  return result;
}

/**
 * Get a single student's rank for a paper.
 */
async function getStudentRank(paperId, userId) {
  const { rows } = await db.query(
    `SELECT national_rank, district_rank, score, time_taken_secs, district
     FROM rankings WHERE paper_id = $1 AND user_id = $2`,
    [paperId, userId]
  );
  return rows[0] || null;
}

module.exports = { computeRankings, getLeaderboard, getStudentRank };

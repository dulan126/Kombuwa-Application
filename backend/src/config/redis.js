'use strict';
const { createClient } = require('redis');
const logger = require('../utils/logger');

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) },
});

client.on('error',   (err)  => logger.error('Redis error: ' + err.message));
client.on('connect', ()     => logger.info('Redis connected'));
client.on('reconnecting', () => logger.warn('Redis reconnecting…'));

const redis = {
  connect: () => client.connect(),

  get:    (key)            => client.get(key),
  set:    (key, val, opts) => client.set(key, val, opts),
  del:    (key)            => client.del(key),
  exists: (key)            => client.exists(key),
  expire: (key, secs)      => client.expire(key, secs),
  incr:   (key)            => client.incr(key),

  // Leaderboard helpers (sorted sets)
  zadd:       (key, score, member)         => client.zAdd(key, { score, value: member }),
  zrank:      (key, member)                => client.zRank(key, member),
  zrevrank:   (key, member)                => client.zRevRank(key, member),
  zcard:      (key)                        => client.zCard(key),
  zrevrange:  (key, start, stop, withScores) =>
    withScores
      ? client.zRangeWithScores(key, start, stop, { REV: true })
      : client.zRange(key, start, stop,  { REV: true }),

  // JSON helpers
  setJSON: (key, obj, ttlSecs) =>
    client.set(key, JSON.stringify(obj), ttlSecs ? { EX: ttlSecs } : undefined),
  getJSON: async (key) => {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  },
};

module.exports = redis;

'use strict';

require('dotenv').config();

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),

  // JSON Web Token
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-please-32chars-min',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // PostgreSQL
  db: {
    connectionString: process.env.DATABASE_URL || null,
    host: process.env.PGHOST || 'localhost',
    port: int(process.env.PGPORT, 5432),
    user: process.env.PGUSER || 'chess',
    password: process.env.PGPASSWORD || 'chess',
    database: process.env.PGDATABASE || 'chess',
  },

  // CORS: comma separated origins, or '*' for any
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Game timing
  reconnectGraceSeconds: int(process.env.RECONNECT_GRACE_SECONDS, 60),
  abandonGraceSeconds: int(process.env.ABANDON_GRACE_SECONDS, 30),
};

module.exports = config;

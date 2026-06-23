'use strict';

const { Pool } = require('pg');
const config = require('../config');

const poolConfig = config.db.connectionString
  ? { connectionString: config.db.connectionString }
  : {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Error inesperado en cliente inactivo del pool:', err.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};

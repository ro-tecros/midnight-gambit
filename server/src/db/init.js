'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Espera a que la base de datos esté disponible (útil con docker-compose,
 * donde el contenedor de la app puede arrancar antes que Postgres) y aplica
 * el esquema de forma idempotente.
 */
async function initDb({ retries = 30, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      await pool.query(schema);
      // eslint-disable-next-line no-console
      console.log('[db] Conectado y esquema aplicado.');
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(
        `[db] Esperando a PostgreSQL (intento ${attempt}/${retries}): ${err.message}`
      );
      if (attempt === retries) throw err;
      await wait(delayMs);
    }
  }
}

module.exports = { initDb };

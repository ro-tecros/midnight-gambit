-- Midnight Gambit — Esquema de base de datos
-- Se ejecuta automáticamente al arrancar el servidor (idempotente).

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(32)  NOT NULL UNIQUE,
  email           VARCHAR(255) UNIQUE,
  password_hash   VARCHAR(255),
  is_guest        BOOLEAN      NOT NULL DEFAULT FALSE,
  avatar_color    VARCHAR(7)   NOT NULL DEFAULT '#C9A35B',
  rating          INTEGER      NOT NULL DEFAULT 1200,
  games_played    INTEGER      NOT NULL DEFAULT 0,
  wins            INTEGER      NOT NULL DEFAULT 0,
  losses          INTEGER      NOT NULL DEFAULT 0,
  draws           INTEGER      NOT NULL DEFAULT 0,
  time_played_ms  BIGINT       NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (lower(username));

CREATE TABLE IF NOT EXISTS games (
  id               SERIAL PRIMARY KEY,
  code             VARCHAR(12)  NOT NULL UNIQUE,
  white_id         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  black_id         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  white_name       VARCHAR(32),
  black_name       VARCHAR(32),
  status           VARCHAR(16)  NOT NULL DEFAULT 'waiting', -- waiting|active|finished|aborted
  result           VARCHAR(8),                              -- 1-0 | 0-1 | 1/2-1/2
  result_reason    VARCHAR(32),                             -- checkmate|resign|timeout|...
  winner_color     VARCHAR(5),                              -- white|black|null
  is_private       BOOLEAN      NOT NULL DEFAULT FALSE,
  is_rated         BOOLEAN      NOT NULL DEFAULT TRUE,
  initial_ms       INTEGER      NOT NULL DEFAULT 300000,
  increment_ms     INTEGER      NOT NULL DEFAULT 0,
  pgn              TEXT,
  final_fen        TEXT,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_white ON games (white_id);
CREATE INDEX IF NOT EXISTS idx_games_black ON games (black_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games (status);

CREATE TABLE IF NOT EXISTS moves (
  id             SERIAL PRIMARY KEY,
  game_id        INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply            INTEGER NOT NULL,
  san            VARCHAR(12) NOT NULL,
  uci            VARCHAR(6)  NOT NULL,
  fen_after      TEXT        NOT NULL,
  clock_white_ms INTEGER,
  clock_black_ms INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moves_game ON moves (game_id, ply);

CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

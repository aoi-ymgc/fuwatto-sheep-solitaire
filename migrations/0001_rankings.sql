-- Shared, completed-game rankings. All timestamps and durations are seconds.
CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL CHECK (game IN ('solitaire', 'spider')),
  difficulty TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  elapsed_time INTEGER NOT NULL CHECK (elapsed_time >= 0),
  moves INTEGER NOT NULL CHECK (moves >= 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rankings_leaderboard_idx
  ON rankings (game, difficulty, score DESC, elapsed_time ASC, moves ASC, created_at ASC);

-- The client key is a SHA-256 digest of the request IP and an optional Worker secret.
-- It is used only to cap repeated submissions and is never returned by the API.
CREATE TABLE IF NOT EXISTS ranking_rate_limits (
  client_key TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  submissions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_started_at)
);

CREATE INDEX IF NOT EXISTS ranking_rate_limits_expiry_idx
  ON ranking_rate_limits (window_started_at);

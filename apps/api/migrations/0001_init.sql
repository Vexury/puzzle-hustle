CREATE TABLE players (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (provider, subject)
);

CREATE TABLE groups (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES players(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE members (
  group_id    TEXT NOT NULL REFERENCES groups(id),
  player_id   TEXT NOT NULL REFERENCES players(id),
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (group_id, player_id)
);

CREATE TABLE scores (
  player_id   TEXT NOT NULL REFERENCES players(id),
  puzzle      TEXT NOT NULL,
  seconds     INTEGER NOT NULL,
  hints       INTEGER NOT NULL,
  moves       INTEGER NOT NULL,
  solved_at   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, puzzle)
);

CREATE INDEX scores_by_puzzle ON scores (puzzle, hints, seconds);
CREATE INDEX scores_by_player_time ON scores (player_id, created_at);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES players(id),
  target_id   TEXT NOT NULL REFERENCES players(id),
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

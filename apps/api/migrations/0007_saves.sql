CREATE TABLE saves (
  player_id   TEXT PRIMARY KEY REFERENCES players(id),
  data        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

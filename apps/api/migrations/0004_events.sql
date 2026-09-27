-- Anonymous usage events (POST /events). Nothing here names a player or a device, and no row
-- is finer in time than a day. Rows older than about 13 months are deleted by the daily cron.
CREATE TABLE events (
  day         TEXT NOT NULL,
  kind        TEXT NOT NULL,
  platform    TEXT NOT NULL,
  build       TEXT NOT NULL,
  age         INTEGER NOT NULL,
  type        TEXT,
  difficulty  TEXT,
  mode        TEXT,
  level       INTEGER,
  outcome     TEXT,
  seconds     INTEGER,
  moves       INTEGER,
  hints       INTEGER,
  resumed     INTEGER,
  first       INTEGER,
  step        INTEGER
);

CREATE INDEX events_day_kind ON events (day, kind);

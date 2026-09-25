-- A player an owner removed from a group; joinGroup turns them away. Cascades so deleting the
-- group or either player never trips over a ban left behind.
CREATE TABLE group_bans (
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (group_id, player_id)
);

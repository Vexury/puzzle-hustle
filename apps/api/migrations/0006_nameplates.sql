-- The strip behind the name in the standings, and up to four showcase badges as a JSON list
-- (the first is also in `badge`, which older clients still read).
ALTER TABLE players ADD COLUMN nameplate TEXT;
ALTER TABLE players ADD COLUMN badges TEXT;

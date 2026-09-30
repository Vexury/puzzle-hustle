-- Highest Hustle stage the player reported, 0 before the first. Shown in the player card.
ALTER TABLE players ADD COLUMN hustle INTEGER NOT NULL DEFAULT 0;

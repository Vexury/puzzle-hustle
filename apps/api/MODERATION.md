# Moderation

Display names and group names are the only user-generated content. In the app, a group owner can remove a member from a leaderboard row, which also bans them from that group (`group_bans`), and any player can hide another player locally. Reports (`POST /report`) are acted on by hand with the queries below.

Run the commands from `apps/api`. `--remote` works on the production database: check the query twice before running it. Use `--local` to try it against the dev database first.

## List open reports

Newest first, with both names and how often the target was reported:

```powershell
npx wrangler d1 execute puzzle-hustle --remote --command "SELECT r.created_at, r.reason, t.id AS target_id, t.name AS target, rp.name AS reporter, (SELECT COUNT(*) FROM reports x WHERE x.target_id = r.target_id) AS times FROM reports r JOIN players t ON t.id = r.target_id JOIN players rp ON rp.id = r.reporter_id ORDER BY r.created_at DESC LIMIT 50"
```

`created_at` is milliseconds since the epoch.

## Find the target's groups

```powershell
npx wrangler d1 execute puzzle-hustle --remote --command "SELECT g.id, g.name, g.code, g.owner_id FROM members m JOIN groups g ON g.id = m.group_id WHERE m.player_id = '<target_id>'"
```

## Rename an offensive name

Replaces the name; the player can pick a new one, which goes through the name filter again.

```powershell
npx wrangler d1 execute puzzle-hustle --remote --command "UPDATE players SET name = 'Player' WHERE id = '<target_id>'"
```

## Remove and ban from a group

Same effect as the owner's Remove button:

```powershell
npx wrangler d1 execute puzzle-hustle --remote --command "INSERT OR IGNORE INTO group_bans (group_id, player_id, created_at) VALUES ('<group_id>', '<target_id>', CAST(strftime('%s','now') AS INTEGER) * 1000); DELETE FROM members WHERE group_id = '<group_id>' AND player_id = '<target_id>'"
```

Lift a ban:

```powershell
npx wrangler d1 execute puzzle-hustle --remote --command "DELETE FROM group_bans WHERE group_id = '<group_id>' AND player_id = '<target_id>'"
```

If the target owns the group, removing them with this query leaves the group without its owner among the members. Hand it over first:

```powershell
npx wrangler d1 execute puzzle-hustle --remote --command "UPDATE groups SET owner_id = '<new_owner_id>' WHERE id = '<group_id>'"
```

## Close a report

Once handled:

```powershell
npx wrangler d1 execute puzzle-hustle --remote --command "DELETE FROM reports WHERE target_id = '<target_id>'"
```

// Local verification only. Mints a player row in the local D1 database and a session token
// signed with the same SESSION_SECRET wrangler dev reads from .dev.vars, so a screen that
// needs a signed-in player can be exercised in a real browser without a Google OAuth client id.
// Has no place in production and talks to nothing but the local D1 instance.
//
// Usage (from apps/api):
//   node scripts/create-dev-session.ts [name]
//
// Prints a JSON object shaped exactly like lib/api.ts's Session. Paste it as the value of the
// "ph:session" key in the browser's localStorage (on the origin the web app runs on) to be
// signed in as that player.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signSession } from '../src/token.ts';

const apiRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readDevVar(key: string): string {
  const raw = readFileSync(path.join(apiRoot, '.dev.vars'), 'utf8');
  for (const line of raw.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k?.trim() === key) return rest.join('=').trim();
  }
  throw new Error(`${key} missing from apps/api/.dev.vars`);
}

function wranglerBin(): string {
  const pkgUrl = fileURLToPath(import.meta.resolve('wrangler/package.json'));
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { bin: { wrangler: string } };
  return path.join(path.dirname(pkgUrl), pkg.bin.wrangler);
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function d1Execute(sql: string) {
  execFileSync('node', [wranglerBin(), 'd1', 'execute', 'puzzle-hustle', '--local', '--command', sql], {
    cwd: apiRoot,
    stdio: 'pipe',
  });
}

const name = process.argv[2] ?? 'Dev Player';
const id = crypto.randomUUID();
const subject = crypto.randomUUID();

d1Execute(
  `INSERT INTO players (id, provider, subject, name, created_at) VALUES (${sqlLiteral(id)}, 'dev', ${sqlLiteral(subject)}, ${sqlLiteral(name)}, ${Date.now()});`,
);

const secret = readDevVar('SESSION_SECRET');
const token = await signSession(id, secret);

console.log(JSON.stringify({ token, player: { id, name } }, null, 2));

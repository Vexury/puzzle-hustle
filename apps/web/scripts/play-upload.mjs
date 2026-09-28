// Uploads the release AAB to a Play test track with the notes from store/paste, through the
// Play Developer API and a service account (key path in PLAY_SERVICE_ACCOUNT_JSON).
//   node scripts/play-upload.mjs --check        list the tracks, change nothing
//   node scripts/play-upload.mjs [--track alpha] upload, set the release and send it for review
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PACKAGE = 'dev.vexury.puzzlehustle';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const AAB = `${ROOT}apps/web/android/app/build/outputs/bundle/release/app-release.aab`;

const args = process.argv.slice(2);
const check = args.includes('--check');
const track = args.includes('--track') ? args[args.indexOf('--track') + 1] : 'alpha';

const keyPath = process.env.PLAY_SERVICE_ACCOUNT_JSON;
if (!keyPath) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is not set');
const key = JSON.parse(await readFile(keyPath, 'utf8'));

async function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: key.token_uri, iat: now, exp: now + 3600 };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const auth = { Authorization: `Bearer ${await token()}` };

async function call(method, url, body, headers = { 'Content-Type': 'application/json' }) {
  const res = await fetch(url, { method, headers: { ...auth, ...headers }, body: body && !(body instanceof Buffer) ? JSON.stringify(body) : body });
  if (!res.ok) throw new Error(`${method} ${url.replace(API, '').replace(UPLOAD, '')}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const edit = await call('POST', `${API}/edits`);
const editUrl = `${API}/edits/${edit.id}`;

if (check) {
  const { tracks } = await call('GET', `${editUrl}/tracks`);
  for (const t of tracks) console.log(t.track, JSON.stringify((t.releases ?? []).map((r) => ({ status: r.status, versionCodes: r.versionCodes }))));
  await call('DELETE', editUrl);
  process.exit(0);
}

const gradle = await readFile(`${ROOT}apps/web/android/app/build.gradle`, 'utf8');
const versionCode = Number(/versionCode (\d+)/.exec(gradle)[1]);
const notes = await readFile(`${ROOT}store/paste/release-notes-${versionCode}.txt`, 'utf8');
const releaseNotes = [...notes.matchAll(/<([a-z]{2}-[A-Z]{2})>\r?\n([\s\S]*?)\r?\n<\/\1>/g)].map(([, language, text]) => ({ language, text: text.trim() }));
if (!releaseNotes.length) throw new Error(`no release notes in release-notes-${versionCode}.txt`);

const bundle = await call('POST', `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`, await readFile(AAB), { 'Content-Type': 'application/octet-stream' });
if (bundle.versionCode !== versionCode) {
  await call('DELETE', editUrl);
  throw new Error(`AAB has versionCode ${bundle.versionCode}, build.gradle says ${versionCode}: rebuild first`);
}
console.log(`uploaded versionCode ${bundle.versionCode}`);
await call('PUT', `${editUrl}/tracks/${track}`, { track, releases: [{ name: `${versionCode}`, versionCodes: [`${versionCode}`], status: 'completed', releaseNotes }] });
await call('POST', `${editUrl}:commit`);
console.log(`versionCode ${versionCode} committed to ${track}, notes: ${releaseNotes.map((n) => n.language).join(', ')}`);

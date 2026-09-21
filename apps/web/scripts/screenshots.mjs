// Store screenshots, driven through Chrome's remote debugging port.
//
//   node scripts/screenshots.mjs <base-url> <out-dir> [phone|tablet7|tablet10]
//
// Chrome has to be running with --remote-debugging-port=9222 and its own --user-data-dir.
// The seed comes from packages/core/scripts/screenshot-seed.ts; without it every screen would
// read "0 solved". Sizes keep Play's rule that the long side may not exceed twice the short
// one, which a real 20:9 phone capture breaks.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [, , BASE = 'http://localhost:4174', OUT = '../../../store/screenshots/phone', SET = 'phone'] = process.argv;

const SIZES = {
  phone: { width: 360, height: 640, scale: 3 },
  tablet7: { width: 600, height: 960, scale: 2 },
  tablet10: { width: 800, height: 1280, scale: 2 },
};

const SHOTS = [
  { name: '01-daily', at: '/', theme: 'dark' },
  { name: '02-nonogram', daily: 'nonogram', theme: 'light' },
  { name: '03-crowns', daily: 'crowns', theme: 'dark' },
  { name: '04-shapes', daily: 'shapes', theme: 'light' },
  { name: '05-killer', daily: 'killer', theme: 'dark' },
  { name: '06-puzzles', at: '/levels', theme: 'light' },
];

const seed = execFileSync(
  process.execPath,
  ['--experimental-strip-types', fileURLToPath(new URL('../../../packages/core/scripts/screenshot-seed.ts', import.meta.url))],
  { encoding: 'utf8' },
).trim();

const size = SIZES[SET];
const outDir = fileURLToPath(new URL(`${OUT}/`, import.meta.url));
await mkdir(outDir, { recursive: true });

const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.scale, mobile: true });

await send('Page.navigate', { url: `${BASE}/` });
await wait(2500);
await evaluate(`(function(){ localStorage.clear(); const s = ${seed}; for (const k in s) localStorage.setItem(k, s[k]); return 1; })()`);

await send('Page.navigate', { url: `${BASE}/` });
await wait(3000);
const links = JSON.parse(
  (await evaluate(
    `JSON.stringify(Object.fromEntries(Array.from(document.querySelectorAll('a[href*="p=daily"]')).map((a) => [new URLSearchParams(a.getAttribute('href').split('?')[1]).get('t'), a.getAttribute('href')])))`,
  )) || '{}',
);

for (const shot of SHOTS) {
  const path = shot.at ?? links[shot.daily];
  if (!path) {
    console.log(`${shot.name}: kein Link fuer ${shot.daily}, uebersprungen`);
    continue;
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: shot.theme }] });
  await send('Page.navigate', { url: BASE + path });
  await wait(2600);
  const png = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${outDir}${shot.name}.png`, Buffer.from(png.result.data, 'base64'));
  console.log(`${shot.name}.png  ${size.width * size.scale}x${size.height * size.scale}  ${shot.theme}`);
}

await send('Page.close');
ws.close();

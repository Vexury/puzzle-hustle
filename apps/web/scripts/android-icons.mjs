import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LOGO_PATH } from '../src/lib/logo.ts';
import { BG, FG, SPLASH_BG, SPLASH_PIECE, icon, motif } from './mark.mjs';

const RES = fileURLToPath(new URL('../android/app/src/main/res/', import.meta.url));

const LEGACY = icon({ rounded: true });

// Launchers like One UI show nearly the whole 72 dp visible area, so the piece is sized against
// that: 34 units of motif at 1.235 give 42 dp, about 58 % of the visible height.
const FOREGROUND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(14.48,14.48) scale(1.235)">${motif()}</g>
</svg>`;

const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

function render(svg, size) {
  return sharp(Buffer.from(svg), { density: 512 }).resize(size, size).png().toBuffer();
}

async function round(buffer, size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(buffer)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

for (const [density, scale] of DENSITIES) {
  const dir = `${RES}mipmap-${density}`;
  await mkdir(dir, { recursive: true });

  const launcherSize = Math.round(48 * scale);
  const launcher = await render(LEGACY, launcherSize);
  await writeFile(`${dir}/ic_launcher.png`, launcher);
  await writeFile(`${dir}/ic_launcher_round.png`, await round(launcher, launcherSize));
  await writeFile(`${dir}/ic_launcher_foreground.png`, await render(FOREGROUND, Math.round(108 * scale)));

  console.log(`${density}: ${launcherSize}px launcher, ${Math.round(108 * scale)}px foreground`);
}

await writeFile(
  `${RES}values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
);
console.log('ic_launcher_background set to', BG);

// The launch splash draws the piece as a vector, so it stays sharp at any size; the bitmap
// foreground above got stretched from 108 dp to the splash's 288 dp. Without an icon background
// Android shows 288 dp and keeps the middle 192 dp circle; the piece sits well inside it, at the
// size the web launch (components/Launch.tsx) takes over from.
const SPLASH_W = SPLASH_PIECE * 0.75;
await mkdir(`${RES}drawable`, { recursive: true });
await writeFile(
  `${RES}drawable/splash_icon.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="288dp"
    android:height="288dp"
    android:viewportWidth="288"
    android:viewportHeight="288">
    <group
        android:translateX="${(288 - SPLASH_W) / 2}"
        android:translateY="${(288 - SPLASH_PIECE) / 2}"
        android:scaleX="${SPLASH_PIECE / 160}"
        android:scaleY="${SPLASH_PIECE / 160}">
        <path
            android:fillColor="${FG}"
            android:pathData="${LOGO_PATH}" />
    </group>
</vector>
`,
);
for (const [dir, color] of [
  ['values', SPLASH_BG.light],
  ['values-night', SPLASH_BG.dark],
]) {
  await mkdir(`${RES}${dir}`, { recursive: true });
  await writeFile(`${RES}${dir}/splash.xml`, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="splash_background">${color}</color>
</resources>
`);
}
console.log(`splash_icon ${SPLASH_PIECE} dp piece, background ${SPLASH_BG.light} / ${SPLASH_BG.dark}`);

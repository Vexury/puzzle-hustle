import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LOGO_PATH } from '../src/lib/logo.ts';
import { BG, FG, SPLASH_BG, SPLASH_PIECE, icon } from './mark.mjs';

const ASSETS = fileURLToPath(new URL('../ios/App/App/Assets.xcassets/', import.meta.url));

// App Store rejects icons with an alpha channel, and iOS rounds the corners itself.
await sharp(Buffer.from(icon()), { density: 1200 })
  .resize(1024, 1024)
  .flatten({ background: BG })
  .removeAlpha()
  .png()
  .toFile(`${ASSETS}AppIcon.appiconset/AppIcon-512@2x.png`);
console.log('AppIcon 1024');

// The launch screen (LaunchScreen.storyboard) centres the piece at its size in points on the
// page background of the system's light or dark mode, where the web launch (Launch.tsx) takes
// over; one sharp bitmap per scale instead of a 2732 square scaled to fill the display.
const W = SPLASH_PIECE * 0.75;
const piece = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><path d="${LOGO_PATH}" fill="${FG}"/></svg>`;
const images = [];
for (const scale of [1, 2, 3]) {
  const filename = `splash@${scale}x.png`;
  await sharp(Buffer.from(piece), { density: 72 * scale * 4 })
    .resize(W * scale, SPLASH_PIECE * scale)
    .png()
    .toFile(`${ASSETS}Splash.imageset/${filename}`);
  images.push({ idiom: 'universal', filename, scale: `${scale}x` });
}
await writeFile(`${ASSETS}Splash.imageset/Contents.json`, JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n');
const rgb = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => `0x${hex.slice(i, i + 2).toUpperCase()}`);
  return { 'color-space': 'srgb', components: { red: r, green: g, blue: b, alpha: '1.000' } };
};
await mkdir(`${ASSETS}SplashBackground.colorset`, { recursive: true });
await writeFile(
  `${ASSETS}SplashBackground.colorset/Contents.json`,
  JSON.stringify(
    {
      colors: [
        { idiom: 'universal', color: rgb(SPLASH_BG.light) },
        { idiom: 'universal', appearances: [{ appearance: 'luminosity', value: 'dark' }], color: rgb(SPLASH_BG.dark) },
      ],
      info: { version: 1, author: 'xcode' },
    },
    null,
    2,
  ) + '\n',
);
console.log(`Splash ${W}x${SPLASH_PIECE} pt @1-3x, background ${SPLASH_BG.light} / ${SPLASH_BG.dark}`);

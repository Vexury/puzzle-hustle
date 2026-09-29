import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LOGO_PATH } from '../src/lib/logo.ts';
import { BG, FG, icon } from './mark.mjs';

const ASSETS = fileURLToPath(new URL('../ios/App/App/Assets.xcassets/', import.meta.url));

// App Store rejects icons with an alpha channel, and iOS rounds the corners itself.
await sharp(Buffer.from(icon()), { density: 1200 })
  .resize(1024, 1024)
  .flatten({ background: BG })
  .removeAlpha()
  .png()
  .toFile(`${ASSETS}AppIcon.appiconset/AppIcon-512@2x.png`);
console.log('AppIcon 1024');

// The launch screen fills the display with this square (scaleAspectFill), so a phone shows
// roughly its middle third; 400 px of piece come out near 120 pt tall.
const SIZE = 2732;
const PIECE = 400;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <g transform="translate(${(SIZE - PIECE * 0.75) / 2},${(SIZE - PIECE) / 2}) scale(${PIECE / 160})">
    <path d="${LOGO_PATH}" fill="${FG}"/>
  </g>
</svg>`;
const png = await sharp(Buffer.from(splash)).flatten({ background: BG }).removeAlpha().png().toBuffer();
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await sharp(png).toFile(`${ASSETS}Splash.imageset/${name}`);
}
console.log('Splash 2732 x3');

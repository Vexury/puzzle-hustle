import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BG, icon, motif } from './mark.mjs';

const RES = fileURLToPath(new URL('../android/app/src/main/res/', import.meta.url));

const LEGACY = icon({ rounded: true });

const FOREGROUND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(-1.04,-1.04) scale(1.72)">${motif()}</g>
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

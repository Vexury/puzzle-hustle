import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../../../store/', import.meta.url));

const BG = '#1c1b19';
const FG = '#FFA833';

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>
  <rect x="14" y="14" width="24" height="24" fill="${FG}"/>
  <polygon points="38,26 50,38 38,50 26,38" fill="${FG}"/>
  <polygon points="26,26 38,26 38,38" fill="${BG}"/>
</svg>`;

await mkdir(OUT, { recursive: true });
await sharp(Buffer.from(ICON), { density: 512 }).resize(512, 512).png().toFile(`${OUT}icon-512.png`);
console.log('store/icon-512.png');

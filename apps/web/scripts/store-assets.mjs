import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { icon } from './mark.mjs';

const OUT = fileURLToPath(new URL('../../../store/', import.meta.url));

const ICON = icon();
const ROUNDED = icon({ rounded: true });
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

await mkdir(OUT, { recursive: true });
await sharp(Buffer.from(ICON), { density: 512 }).resize(512, 512).png().toFile(`${OUT}icon-512.png`);
console.log('store/icon-512.png');

for (const size of [192, 512]) {
  await sharp(Buffer.from(ROUNDED), { density: 512 }).resize(size, size).png().toFile(`${PUBLIC}icon-${size}.png`);
  console.log(`public/icon-${size}.png`);
}

await writeFile(`${PUBLIC}icon.svg`, `${ROUNDED}
`);
console.log('public/icon.svg');

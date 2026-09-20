import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../../../store/', import.meta.url));
const FONT = process.env.PH_FONT;
if (!FONT) throw new Error('set PH_FONT to a Nunito ttf (google/fonts: ofl/nunito/Nunito[wght].ttf)');

const BG = '#1c1b19';
const FG = '#FFA833';
const MUTED = '#8d8a85';
const W = 1024;
const H = 500;

const mark = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect x="14" y="14" width="24" height="24" fill="${FG}"/>
    <polygon points="38,26 50,38 38,50 26,38" fill="${FG}"/>
    <polygon points="26,26 38,26 38,38" fill="${BG}"/>
  </svg>`),
  { density: 512 },
)
  .resize(240, 240)
  .png()
  .toBuffer();

const text = (value, px, colour) =>
  sharp({
    text: {
      text: `<span foreground="${colour}">${value}</span>`,
      font: `Nunito ExtraBold ${px}`,
      fontfile: FONT,
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer();

const grid = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><pattern id="g" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M50 0 L0 0 0 50" fill="none" stroke="#2a2825" stroke-width="2"/>
    </pattern></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`,
);

const title = await text('Puzzle Hustle', 78, '#faf9f8');
const tagline = await text('Eight logic puzzles, new every day', 30, MUTED);
const titleMeta = await sharp(title).metadata();

await mkdir(OUT, { recursive: true });
await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
  .composite([
    { input: grid },
    { input: mark, left: 96, top: (H - 240) / 2 },
    { input: title, left: 400, top: Math.round(H / 2 - titleMeta.height - 8) },
    { input: tagline, left: 404, top: Math.round(H / 2 + 14) },
  ])
  .png()
  .toFile(`${OUT}feature-graphic.png`);

console.log('store/feature-graphic.png');

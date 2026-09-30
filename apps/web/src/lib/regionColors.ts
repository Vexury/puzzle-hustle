import { usePack, useTheme } from './theme.ts';

// Region colours for Cats, Hearts and Slabs. They live here rather than as CSS tokens because
// the board picks a colour per region by how different the colours look (regionsPalette), and
// that needs the actual values. Each palette is six hues at two lightness levels, sized so that
// touching regions stay clearly apart and --text stays readable on every colour (packs.test.ts).
// Measured on generated boards in regionColors.test.ts; a palette change must keep passing it.
// Listed so that neighbouring entries swap both hue and lightness: Slabs colours its regions
// in list order, without the distance-aware pick.
export const REGION_PALETTES = {
  light: ['#ffddda', '#8ed9e2', '#f9e4b9', '#b3cafc', '#cef2ce', '#e4bae6', '#b8f3f9', '#f8b8b2', '#dbe6fe', '#e1c792', '#fcd9fd', '#add8ad'],
  dark: ['#704542', '#013d43', '#62502a', '#263454', '#3d5b3e', '#452a46', '#225c62', '#502825', '#425274', '#43330a', '#634765', '#203d21'],
  midnight: ['#233c56', '#351e01', '#433250', '#1b290a', '#532e34', '#002b29', '#4d3518', '#0c253d', '#314021', '#2c1c38', '#0c4441', '#3a171e'],
  synthwave: ['#004744', '#20154e', '#014456', '#340b40', '#0f3d70', '#410228', '#3a326e', '#002826', '#52295e', '#002631', '#622344', '#002147'],
  terminal: ['#7c3f2a', '#222800', '#74470f', '#002e03', '#645000', '#002c20', '#4e5916', '#431000', '#305f31', '#371d00', '#03614b', '#2d2300'],
  inferno: ['#7d2f33', '#00343a', '#684403', '#0b2862', '#275a1c', '#401652', '#035760', '#570914', '#2b4a87', '#3f2802', '#623876', '#0a3701'],
  casino: ['#6a001f', '#7e5000', '#084300', '#3f53a8', '#521261', '#00667d', '#1e2a7b', '#7b3d8c', '#053d4a', '#993142', '#4c2f02', '#246d18'],
} as const;

export type RegionPaletteId = keyof typeof REGION_PALETTES;

export interface RegionPalette {
  colors: readonly string[];
  distance: readonly (readonly number[])[];
}

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// Euclidean OKLab distance times 100: about 2 is just noticeable, 10 is clearly different.
export function colorDistance(a: string, b: string): number {
  const x = oklab(a);
  const y = oklab(b);
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function measure(colors: readonly string[]): RegionPalette {
  return { colors, distance: colors.map((a) => colors.map((b) => colorDistance(a, b))) };
}

const MEASURED = Object.fromEntries(Object.entries(REGION_PALETTES).map(([id, colors]) => [id, measure(colors)])) as Record<RegionPaletteId, RegionPalette>;

// Packs without their own palette (Paper, Sakura, Cat Café, Ocean) use the one for their mode.
export function regionPaletteId(packId: string | undefined, theme: 'light' | 'dark'): RegionPaletteId {
  return packId && packId in REGION_PALETTES ? (packId as RegionPaletteId) : theme;
}

export function useRegionPalette(): RegionPalette {
  const pack = usePack();
  const { theme } = useTheme();
  return MEASURED[regionPaletteId(pack?.id, pack?.mode ?? theme)];
}

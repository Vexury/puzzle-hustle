import { useEffect } from 'react';
import { usePack } from '../lib/theme.ts';

// Circle and ellipse as path data, so a glyph stays one filled path.
const ellipse = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

// The glyph a pack draws instead of the X that marks a cell as empty: one filled path in a 24
// box, or up to three variants that take turns from cell to cell. Packs without one keep the X.
export const PACK_MARKS: Partial<Record<string, readonly string[]>> = {
  // Pencilled crosses, each stroke bowed and tapered a little differently.
  paper: [
    'M3.5 4.8 4.7 6.6 6.0 8.4 7.3 10.1 8.7 11.8 10.1 13.5 11.8 14.9 13.4 16.3 15.1 17.7 16.9 19.0 18.7 20.3 19.7 18.9 18.1 17.5 16.5 16.1 14.9 14.7 13.4 13.2 12.0 11.6 10.5 10.2 8.9 8.7 7.5 7.2 6.1 5.6 4.7 3.9ZM19.6 3.1 18.2 4.7 16.7 6.3 15.1 7.9 13.6 9.5 12.0 11.0 10.5 12.6 9.0 14.1 7.4 15.7 5.8 17.2 4.2 18.7 5.0 19.7 6.8 18.4 8.6 17.0 10.3 15.6 12.0 14.1 13.7 12.7 15.2 11.0 16.7 9.3 18.1 7.6 19.5 5.8 20.9 4.1Z',
    'M4.6 4.3 6.1 5.8 7.5 7.3 8.9 8.9 10.3 10.5 11.5 12.2 12.9 13.8 14.2 15.4 15.4 17.1 16.6 18.9 17.8 20.7 19.4 19.7 18.3 17.8 17.2 16.0 16.0 14.1 14.8 12.3 13.5 10.6 12.0 9.0 10.4 7.5 8.8 6.0 7.2 4.6 5.5 3.2ZM18.8 4.2 17.1 5.3 15.3 6.5 13.7 7.7 12.0 8.9 10.4 10.2 8.9 11.7 7.5 13.2 6.2 14.8 4.8 16.4 3.6 18.0 4.4 18.8 5.9 17.4 7.4 16.0 8.9 14.7 10.5 13.4 12.1 12.2 13.6 10.8 15.1 9.5 16.6 8.2 18.2 6.9 19.8 5.7Z',
    'M2.8 5.7 4.3 7.3 5.8 8.9 7.3 10.4 8.9 11.9 10.5 13.4 12.3 14.6 14.1 15.9 15.9 17.1 17.7 18.2 19.6 19.4 20.4 18.2 18.7 16.9 17.0 15.5 15.4 14.1 13.8 12.7 12.2 11.3 10.5 10.0 8.9 8.7 7.2 7.3 5.6 5.9 4.0 4.5ZM17.5 3.2 16.4 5.0 15.3 6.7 14.1 8.5 12.9 10.1 11.6 11.8 10.4 13.4 9.2 15.1 7.8 16.7 6.5 18.3 5.0 19.8 6.2 21.0 7.7 19.5 9.2 18.0 10.7 16.4 12.1 14.8 13.5 13.1 14.7 11.3 15.8 9.5 16.8 7.6 17.8 5.7 18.8 3.8Z',
  ],
  sakura: ['M4.2 21.2l2.3-2.4C4.6 11 9.6 4.4 20.6 3.6c.6 11-6.2 16.7-13.1 16l-2.3 2.6Z'],
  midnight: ['M12 1C13 9 15 11 23 12 15 13 13 15 12 23 11 15 9 13 1 12 9 11 11 9 12 1Z'],
  'cat-cafe': [[ellipse(12, 16, 5.6, 4.6), ellipse(5.2, 10.4, 2.2, 2.7), ellipse(9.4, 5.9, 2.2, 2.7), ellipse(14.6, 5.9, 2.2, 2.7), ellipse(18.8, 10.4, 2.2, 2.7)].join('')],
  // A bubble: the inner circle winds the other way, so the ring has its hole under either fill rule.
  ocean: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0ZM5.5 12a6.5 6.5 0 1 1 13 0a6.5 6.5 0 1 1-13 0ZM7.5 9.2a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0Z'],
  inferno: ['M12 1c1 4.5 7 7 7 14a7 7 0 0 1-14 0c0-3.5 2-5.5 3.5-7 0 2.5 1 3.5 2 4.5 1-3.5 0-8 1.5-11.5Z'],
  casino: ['M12 1.5C14.2 5.2 16.8 8.8 20 12 16.8 15.2 14.2 18.8 12 22.5 9.8 18.8 7.2 15.2 4 12 7.2 8.8 9.8 5.2 12 1.5Z'],
};

// Which variant a cell gets: scattered, so neighbours rarely match, and the same on every render.
export function markVariant(marks: readonly string[], cell: number): string {
  return marks[(Math.imul(cell + 1, 2654435761) >>> 16) % marks.length]!;
}

export function usePackMark(): readonly string[] | null {
  const pack = usePack();
  return (pack && PACK_MARKS[pack.id]) ?? null;
}

// The HTML boards draw their X in CSS, so the glyph reaches them as a mask image on the root
// (--mark-glyph) with data-mark-glyph as the switch; theme.css does the rest.
export function useMarkGlyphOnRoot() {
  const mark = usePackMark();
  useEffect(() => {
    const root = document.documentElement;
    const names = ['--mark-glyph', '--mark-glyph-1', '--mark-glyph-2'];
    for (const name of names) root.style.removeProperty(name);
    if (!mark) {
      delete root.dataset['markGlyph'];
      return;
    }
    mark.slice(0, names.length).forEach((d, i) => {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${d}'/></svg>`;
      root.style.setProperty(names[i]!, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    });
    root.dataset['markGlyph'] = '';
  }, [mark]);
}

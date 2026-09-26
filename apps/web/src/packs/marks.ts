import { useEffect } from 'react';
import { usePack } from '../lib/theme.ts';

// Circle and ellipse as path data, so a glyph stays one filled path.
const ellipse = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

// The glyph a pack draws instead of the X that marks a cell as empty: one filled path in a 24
// box. Packs without one keep the X.
export const PACK_MARKS: Partial<Record<string, string>> = {
  paper:
    'M4.6 5.2c4.4 4.1 9.2 9.3 14.4 14.9l-1.3 1.2C12.6 15.8 7.9 10.6 3.4 6.4ZM19.3 4.5c-4.6 4.6-9.6 9.9-14.8 15.4l1.2 1.2c5.3-5.5 10.2-10.8 14.9-15.4Z',
  sakura: 'M12 22C6 16 5 9 8 4c1.3-1.6 2.7-1.6 4 .5 1.3-2.1 2.7-2.1 4-.5 3 5 2 12-4 18Z',
  midnight: 'M12 1C13 9 15 11 23 12 15 13 13 15 12 23 11 15 9 13 1 12 9 11 11 9 12 1Z',
  'cat-cafe': [ellipse(12, 16, 5.6, 4.6), ellipse(5.2, 10.4, 2.2, 2.7), ellipse(9.4, 5.9, 2.2, 2.7), ellipse(14.6, 5.9, 2.2, 2.7), ellipse(18.8, 10.4, 2.2, 2.7)].join(''),
};

export function usePackMark(): string | null {
  const pack = usePack();
  return (pack && PACK_MARKS[pack.id]) ?? null;
}

// The HTML boards draw their X in CSS, so the glyph reaches them as a mask image on the root
// (--mark-glyph) with data-mark-glyph as the switch; theme.css does the rest.
export function useMarkGlyphOnRoot() {
  const mark = usePackMark();
  useEffect(() => {
    const root = document.documentElement;
    if (!mark) {
      delete root.dataset['markGlyph'];
      root.style.removeProperty('--mark-glyph');
      return;
    }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${mark}'/></svg>`;
    root.style.setProperty('--mark-glyph', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    root.dataset['markGlyph'] = '';
  }, [mark]);
}

// Pixel art drawn for the café, in the kitten sheet's style: near-black outline, flat fills,
// shown at two screen pixels per art pixel like the kittens. One string per row, one character
// per pixel; a space is transparent.
const COLOURS: Record<string, string> = {
  '1': '#120e14',
  g: '#626773',
  h: '#414752',
  w: '#f8f2ea',
  s: '#d6c8ba',
  k: '#c48c58',
  c: '#6b3f22',
  d: '#e9ded0',
  m: '#fffaf4',
  r: '#c43440',
};

export const TAIL = ['1gg1', '1gh1', '1gg1', '1gh1', '1gg1', ' 1gg1', ' 1gg1', ' 1gh1', ' 1gg1', '  11'];

export const CUP = [
  '  11111111    ',
  ' 1kkckkckk1   ',
  ' 1wwwwwwws1111',
  ' 1wwwwwwws1  1',
  ' 1wwwwwwws1  1',
  ' 1wwwwwwws1111',
  '  1wwwwws1    ',
  '111111111111  ',
  '1dddddddddd1  ',
  ' 1111111111   ',
];

export const STEAM = [' m ', 'm  ', ' m ', '  m', ' m '];

export const CAKE = [
  '         1r1',
  '        1rr1 ',
  '      11m11  ',
  '    11mmmmm1 ',
  '  11mmmmmmm1 ',
  ' 1kkkkkkkkk1 ',
  ' 1kkkkkkkkk1 ',
  ' 1mmmmmmmmm1 ',
  ' 1kkkkkkkkk1 ',
  ' 11111111111 ',
];

export function Pixels({ art, className }: { art: string[]; className?: string }) {
  const width = Math.max(...art.map((row) => row.length));
  return (
    <svg
      className={className}
      width={width * 2}
      height={art.length * 2}
      viewBox={`0 0 ${width} ${art.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {art.flatMap((row, y) =>
        [...row].map((c, x) => (COLOURS[c] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={COLOURS[c]} /> : null)),
      )}
    </svg>
  );
}

import type { CSSProperties } from 'react';

// kittens.png holds eight animation rows per coat, one 32 px cell per frame, cut from the
// last-tick kitten sheets (see ../CREDITS.md). Row order and frame counts match the atlas.
const ANIMS = {
  look: { row: 0, frames: 6 },
  walkRight: { row: 1, frames: 8 },
  walkLeft: { row: 2, frames: 8 },
  sleepLeft: { row: 3, frames: 2 },
  sleepRight: { row: 4, frames: 2 },
  meow: { row: 5, frames: 3 },
  yawn: { row: 6, frames: 8 },
  wash: { row: 7, frames: 9 },
} as const;

export type KittyAnim = keyof typeof ANIMS;
export const COATS = { grey: 0, ginger: 1, white: 2 } as const;

// One kitten playing one row. With `pause` it rests on the first frame for most of each loop,
// so a yawn or a wash comes now and then instead of without end.
export function Kitty({
  coat,
  anim,
  seconds,
  pause = false,
  scale = 3,
  className,
  style,
}: {
  coat: keyof typeof COATS;
  anim: KittyAnim;
  seconds: number;
  pause?: boolean;
  scale?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { row, frames } = ANIMS[anim];
  return (
    <div
      className={`kitty${pause ? ' kitty-pause' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={
        {
          ...style,
          '--kitty-scale': scale,
          '--kitty-row': COATS[coat] * 8 + row,
          '--kitty-frames': frames,
          animationDuration: `${seconds}s`,
        } as CSSProperties
      }
    />
  );
}

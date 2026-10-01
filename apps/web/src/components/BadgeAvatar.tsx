import { badgeRarity, findCosmetic } from '@puzzle-hustle/core';
import { BadgeIcon } from './BadgeIcon.tsx';

// A badge as an avatar: on a plate whose frame follows the badge's rarity (from its price).
// Without a badge it shows the name's first letter, so every row keeps its shape.
export function BadgeAvatar({ id, name, className, wave = 0 }: { id: string | null | undefined; name: string; className?: string; wave?: number }) {
  const badge = findCosmetic(id);
  const extra = className ? ` ${className}` : '';
  if (badge?.kind !== 'badge') {
    return (
      <span className={`badge-avatar empty${extra}`} aria-hidden="true">
        {[...name.trim()][0]?.toUpperCase() ?? '?'}
      </span>
    );
  }
  return (
    <span className={`badge-avatar rarity-${badgeRarity(badge)}${extra}`} title={badge.title}>
      <BadgeIcon id={badge.id} className="badge-avatar-icon" wave={wave} />
    </span>
  );
}

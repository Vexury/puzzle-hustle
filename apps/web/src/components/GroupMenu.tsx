import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { pushBackGuard } from '../lib/back.ts';

interface MenuGroup {
  id: string;
  name: string;
  members: number;
}

// The group picker next to Standings: a pill that opens a themed list under it (2026-10-02; the
// native select opened the system list, which no theme reaches). Closes on a pick, a tap
// elsewhere, Escape and the Android back button.
export function GroupMenu({ groups, active, onPick }: { groups: readonly MenuGroup[]; active: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = groups.find((g) => g.id === active);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    const release = pushBackGuard(() => {
      setOpen(false);
      return true;
    });
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', outside);
      release();
    };
  }, [open]);

  const pick = (id: string) => {
    setOpen(false);
    if (id !== active) onPick(id);
  };

  const keys = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('.group-menu-button')?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="group-menu" ref={root}>
      <button type="button" className="group-menu-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="group-menu-name">{current?.name}</span>
        <svg viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1l5 5 5-5" />
        </svg>
      </button>
      {open && (
        <ul className="group-menu-list" role="listbox" aria-label="Group" ref={list} onKeyDown={keys}>
          {groups.map((group) => (
            <li key={group.id}>
              <button type="button" role="option" aria-selected={group.id === active} onClick={() => pick(group.id)}>
                <span className="group-menu-text">
                  <b>{group.name}</b>
                  <span className="muted small">
                    {group.members} member{group.members === 1 ? '' : 's'}
                  </span>
                </span>
                {group.id === active && (
                  <svg className="group-menu-check" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

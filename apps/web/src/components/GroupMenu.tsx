import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { pushBackGuard } from '../lib/back.ts';

interface MenuGroup {
  id: string;
  name: string;
  code: string;
  members: number;
}

export type GroupAction = 'invite' | 'new' | 'join' | 'leave';

// The group picker next to Standings: a pill that opens a themed list under it (2026-10-02; the
// native select opened the system list, which no theme reaches). Below the groups sit the
// actions that used to fill the page under the standings, so nothing there moves when a card's
// height changes. Closes on a pick, a tap elsewhere, Escape and the Android back button.
export function GroupMenu({
  groups,
  active,
  onPick,
  onAction,
}: {
  groups: readonly MenuGroup[];
  active: string;
  onPick: (id: string) => void;
  onAction: (action: GroupAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
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
    pop.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', outside);
      release();
    };
  }, [open]);

  const pick = (id: string) => {
    setOpen(false);
    if (id !== active) onPick(id);
  };
  const act = (action: GroupAction) => {
    setOpen(false);
    onAction(action);
  };

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('.group-menu-button')?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(pop.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="group-menu" ref={root}>
      <button type="button" className="group-menu-button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="group-menu-name">{current?.name}</span>
        <svg viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1l5 5 5-5" />
        </svg>
      </button>
      {open && current && (
        <div className="group-menu-pop" ref={pop} onKeyDown={keys}>
          <ul role="listbox" aria-label="Group">
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
          <ul className="group-menu-actions" aria-label="Group actions">
            <li>
              <button type="button" onClick={() => act('invite')}>
                <span className="group-menu-text">
                  <b>Invite to {current.name}</b>
                  <span className="muted small">
                    code <span className="num">{current.code}</span>
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => act('new')}>
                <b>New group</b>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => act('join')}>
                <b>Join with code</b>
              </button>
            </li>
            <li>
              <button type="button" className="danger" onClick={() => act('leave')}>
                <b>{current.members === 1 ? `Delete ${current.name}` : `Leave ${current.name}`}</b>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

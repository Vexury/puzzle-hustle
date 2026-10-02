import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GroupMenu } from '../src/components/GroupMenu.tsx';
import { handleBackPress } from '../src/lib/back.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const groups = [
  { id: 'a', name: 'OGs', members: 8 },
  { id: 'b', name: 'Family', members: 1 },
];

function mount() {
  const onPick = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(GroupMenu, { groups, active: 'a', onPick })));
  const button = container.querySelector<HTMLButtonElement>('.group-menu-button')!;
  return { container, button, onPick };
}

it('opens the list with the active group checked and picks another', () => {
  const { container, button, onPick } = mount();
  expect(container.querySelector('.group-menu-list')).toBeNull();
  act(() => button.click());
  expect(button.getAttribute('aria-expanded')).toBe('true');
  const options = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  expect(options[1]!.textContent).toContain('1 member');
  act(() => options[1]!.click());
  expect(onPick).toHaveBeenCalledWith('b');
  expect(container.querySelector('.group-menu-list')).toBeNull();
});

it('closes on a tap elsewhere and on the back button', () => {
  const { container, button } = mount();
  act(() => button.click());
  act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  expect(container.querySelector('.group-menu-list')).toBeNull();
  act(() => button.click());
  act(() => {
    expect(handleBackPress(true)).toBe('guarded');
  });
  expect(container.querySelector('.group-menu-list')).toBeNull();
});

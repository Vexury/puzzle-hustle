import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Account } from '../src/pages/Account.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function openReset(): string {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(Account)));
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Reset')!;
  act(() => button.click());
  const text = container.textContent ?? '';
  act(() => root.unmount());
  return text;
}

it('says the reset reaches all devices when signed in', () => {
  localStorage.clear();
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id: 'p1', name: 'Moritz' } }));
  expect(openReset()).toContain('on all your devices');
});

it('says the reset stays on this device when signed out', () => {
  localStorage.clear();
  expect(openReset()).toContain('on this device');
});

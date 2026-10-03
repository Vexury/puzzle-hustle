import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Profile } from '../src/pages/Profile.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(): string {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(Profile)));
  const text = container.textContent ?? '';
  act(() => root.unmount());
  return text;
}

it('says progress stays on the device when signed out', () => {
  localStorage.clear();
  expect(render()).toContain('Your progress stays on this device.');
});

it('says progress is synced when signed in', () => {
  localStorage.clear();
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id: 'p1', name: 'Moritz' } }));
  const text = render();
  expect(text).toContain('Your progress is synced with your account.');
  expect(text).not.toContain('stays on this device');
});

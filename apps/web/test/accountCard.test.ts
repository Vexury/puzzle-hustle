import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AccountCard } from '../src/components/AccountCard.tsx';
import { writeSession } from '../src/lib/api.ts';
import { signOut } from '../src/lib/auth.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('drops the signed-out player name from an open card', () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  localStorage.setItem('ph:name', 'Moritz');
  act(() => root.render(createElement(AccountCard)));
  expect(container.querySelector('.name-btn')?.textContent).toContain('Moritz');
  act(() => signOut());
  expect(container.querySelector('.name-btn')?.textContent).toContain('Add a name');
});

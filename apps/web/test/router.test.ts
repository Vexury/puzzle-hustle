import { expect, it } from 'vitest';
import { leaveTo, navigate } from '../src/lib/router.ts';

window.scrollTo = () => {};

function popped(): Promise<void> {
  return new Promise((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
}

it('leaving to the screen a page was pushed from steps back instead of stacking it again', async () => {
  navigate('/', true);
  navigate('/play?t=zip&p=daily');
  const depth = history.length;
  const back = popped();
  leaveTo('/');
  await back;
  expect(location.pathname).toBe('/');
  expect(history.length).toBe(depth);
});

it('leaving to any other screen replaces the page, so back never returns into it', () => {
  navigate('/', true);
  navigate('/play?t=zip&l=1');
  const depth = history.length;
  leaveTo('/levels/zip');
  expect(location.pathname).toBe('/levels/zip');
  expect(history.length).toBe(depth);
  expect(history.state).toEqual({ from: '/' });
});

it('a replaced page keeps the screen it was pushed from', async () => {
  navigate('/levels/zip', true);
  navigate('/play?t=zip&l=1');
  navigate('/play?t=zip&l=2', true);
  const back = popped();
  leaveTo('/levels/zip');
  await back;
  expect(location.pathname).toBe('/levels/zip');
});

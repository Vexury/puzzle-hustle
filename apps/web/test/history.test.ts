import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useHistory } from '../src/lib/useHistory.ts';

// Mounts the hook in a throwaway component, the way achievementBanner.test.ts mounts its host.
type History = ReturnType<typeof useHistory<string[]>>;
let history: History;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  history = useHistory<string[]>();
  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe));
  });
});

afterEach(() => {
  act(() => root.unmount());
});

// Each board is a fresh array, as in the games: states are replaced, never mutated.
const a = ['a'];
const b = ['b'];
const c = ['c'];

it('undoes and redoes a line of moves', () => {
  act(() => history.remember(a));
  act(() => history.remember(b));
  let board = c;
  act(() => void (board = history.undo(board)!));
  expect(board).toBe(b);
  act(() => void (board = history.undo(board)!));
  expect(board).toBe(a);
  expect(history.canRedo(board)).toBe(true);
  act(() => void (board = history.redo(board)!));
  expect(board).toBe(b);
  act(() => void (board = history.redo(board)!));
  expect(board).toBe(c);
  expect(history.canRedo(board)).toBe(false);
  act(() => void (board = history.undo(board)!));
  expect(board).toBe(b);
});

it('skips snapshots that are still the current board', () => {
  act(() => history.remember(a));
  act(() => history.remember(b));
  act(() => history.remember(b));
  let board = b;
  act(() => void (board = history.undo(board)!));
  expect(board).toBe(a);
});

it('keeps redo through a touch that changed nothing', () => {
  act(() => history.remember(a));
  let board = b;
  act(() => void (board = history.undo(board)!));
  act(() => history.remember(board));
  expect(history.canRedo(board)).toBe(true);
  act(() => void (board = history.redo(board)!));
  expect(board).toBe(b);
});

it('drops redo once a real move replaces the board', () => {
  act(() => history.remember(a));
  let board = b;
  act(() => void (board = history.undo(board)!));
  act(() => history.remember(board));
  board = c;
  expect(history.canRedo(board)).toBe(false);
  expect(history.redo(board)).toBeUndefined();
  act(() => void (board = history.undo(board)!));
  expect(board).toBe(a);
});

# Theme Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six coin-bought theme packs (Paper, Sakura, Midnight, Cat Café, Terminal, Synthwave) that restyle the whole app, with try-on in the shop.

**Architecture:** A pack is a `kind: 'theme'` cosmetic in the core catalogue, bought through the existing spend log and equipped through `ph:cosmetics`. `lib/theme.ts` owns the root attributes: with a pack active it sets `data-pack` and the pack's fixed `data-theme`, and removes `data-accent`; `packs.css` holds one token block per pack. The shop gets a Themes section whose cards render a mini board under the pack's own attributes, and a try-on that sets the pack without saving it.

**Tech Stack:** TypeScript, React 19 with React Compiler, Vite 8, Vitest 5 (jsdom for `apps/web`), pnpm workspace, plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-25-theme-packs-design.md`

## Global Constraints

- Prices: paper 400, sakura 400, midnight 500, cat-cafe 600, terminal 900, synthwave 1200.
- Modes: paper, sakura, cat-cafe light; midnight, terminal, synthwave dark.
- Cosmetic ids are forever: add, never rename or remove.
- The worker never learns about themes: `POST /cosmetics` receives only `badge` and `flair`.
- `--success` stays clearly green and `--danger` clearly red in every pack.
- Text contrast in every pack: `--text` on `--bg` and on `--card-bg`, `--text-muted` on `--card-bg`, `--accent-text` on `--bg`, `--on-accent` on `--accent`, each at least 4.5:1.
- No component rewrites; packs work through tokens. Pack-specific rules live only in `packs.css`.
- Commit messages in English, body ending with the prose line `Implemented with assistance from Claude <model>.`, no `Co-Authored-By` trailer.
- Run commands from the repo root `C:/GameDev/Apps/PuzzleHustle`. Tests: `pnpm --filter @puzzle-hustle/core test`, `pnpm --filter @puzzle-hustle/web test`; types: `pnpm typecheck`.

## File Map

- Modify `packages/core/src/cosmetics.ts`: `'theme'` kind, `ThemeCosmetic`, `THEMES`.
- Modify `packages/core/test/cosmetics.test.ts`: catalogue tests.
- Modify `apps/web/src/lib/coins.ts`: buy themes, `Equipped.theme`, push payload without theme.
- Modify `apps/web/test/coins.test.ts`: new expectations.
- Modify `apps/web/src/lib/accent.ts`: export `storedAccent`, leave `data-accent` alone under a pack.
- Modify `apps/web/src/lib/theme.ts`: pack state, `activePack`, `usePack`, `tryOnPack`, `equipPack`.
- Create `apps/web/test/theme.test.ts`: root attribute tests.
- Modify `apps/web/src/components/ThemeToggle.tsx`: render nothing under a pack.
- Modify `apps/web/src/pages/Profile.tsx`: appearance card under a pack.
- Create `apps/web/src/packs.css`: one block per pack.
- Modify `apps/web/src/main.tsx`: import `packs.css` after `theme.css`.
- Modify `apps/web/src/theme.css`: `body` background pattern hook, theme card and try-on bar styles.
- Create `apps/web/test/packs.test.ts`: every pack has a block, contrast rules hold.
- Modify `apps/web/src/pages/Shop.tsx`: Themes section, try-on bar, `itemState` knows themes.
- Modify `apps/web/test/shop.test.ts`: theme states.

---

### Task 1: Theme cosmetics in the core catalogue

**Files:**
- Modify: `packages/core/src/cosmetics.ts:3-12` and `:116-120`
- Test: `packages/core/test/cosmetics.test.ts`

**Interfaces:**
- Produces: `type CosmeticKind = 'badge' | 'flair' | 'theme'`; `type ThemeCosmetic = { id: string; kind: 'theme'; title: string; price: number; mode: 'light' | 'dark' }`; `export const THEMES: readonly ThemeCosmetic[]` (catalogue order = shop order); `COSMETICS` includes `THEMES`. `findCosmetic`/`isCosmeticOf` work for themes unchanged.

- [ ] **Step 1: Write the failing tests** — append to `packages/core/test/cosmetics.test.ts`:

```ts
import { THEMES } from '../src/cosmetics.ts';

it('offers six theme packs with their prices and fixed modes, in shop order', () => {
  expect(THEMES.map((t) => [t.id, t.price, t.mode])).toEqual([
    ['paper', 400, 'light'],
    ['sakura', 400, 'light'],
    ['midnight', 500, 'dark'],
    ['cat-cafe', 600, 'light'],
    ['terminal', 900, 'dark'],
    ['synthwave', 1200, 'dark'],
  ]);
  for (const t of THEMES) expect(findCosmetic(t.id)).toBe(t);
});

it('keeps theme ids apart from badge and flair ids', () => {
  expect(isCosmeticOf('paper', 'theme')).toBe(true);
  expect(isCosmeticOf('paper', 'badge')).toBe(false);
  expect(isCosmeticOf('bolt', 'theme')).toBe(false);
});
```

Also add `THEMES` to the existing import line instead of a second import if the file's linting prefers one import per module.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/core test -- cosmetics`
Expected: FAIL, `THEMES` is not exported.

- [ ] **Step 3: Implement** — in `packages/core/src/cosmetics.ts`:

```ts
export type CosmeticKind = 'badge' | 'flair' | 'theme';

export type Cosmetic =
  | { id: string; kind: 'badge'; title: string; price: number }
  | { id: string; kind: 'flair'; title: string; requires: FlairRequirement }
  | { id: string; kind: 'theme'; title: string; price: number; mode: 'light' | 'dark' };

export type BadgeCosmetic = Extract<Cosmetic, { kind: 'badge' }>;
export type FlairCosmetic = Extract<Cosmetic, { kind: 'flair' }>;
export type ThemeCosmetic = Extract<Cosmetic, { kind: 'theme' }>;
```

Below `ACTIVITY_FLAIRS`, before `COSMETICS`:

```ts
// Whole-app looks, each with one fixed mode. Only this device sees them, the worker never does.
export const THEMES: readonly ThemeCosmetic[] = [
  { id: 'paper', kind: 'theme', title: 'Paper', price: 400, mode: 'light' },
  { id: 'sakura', kind: 'theme', title: 'Sakura', price: 400, mode: 'light' },
  { id: 'midnight', kind: 'theme', title: 'Midnight', price: 500, mode: 'dark' },
  { id: 'cat-cafe', kind: 'theme', title: 'Cat Café', price: 600, mode: 'light' },
  { id: 'terminal', kind: 'theme', title: 'Terminal', price: 900, mode: 'dark' },
  { id: 'synthwave', kind: 'theme', title: 'Synthwave', price: 1200, mode: 'dark' },
];

export const COSMETICS: readonly Cosmetic[] = [
  ...BADGES,
  ...PUZZLE_TYPES.flatMap((type) => FLAIRS_BY_TYPE[type]),
  ...ACTIVITY_FLAIRS,
  ...THEMES,
];
```

Check `packages/core/src/index.ts` re-exports `cosmetics.ts` with `export *`; if it lists names, add `THEMES` and `type ThemeCosmetic`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @puzzle-hustle/core test` and `pnpm typecheck`
Expected: all pass. The existing "has eight badges ... and fifty flairs, all with unique ids" test still passes because it filters by kind. `apps/api` still compiles: it only calls `isCosmeticOf(x, 'badge' | 'flair')`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cosmetics.ts packages/core/test/cosmetics.test.ts packages/core/src/index.ts
git commit -m "Add theme packs to the cosmetics catalogue

Implemented with assistance from Claude Opus 5.5."
```

(Leave `index.ts` out of `git add` if it did not change.)

---

### Task 2: Buying and equipping a theme

**Files:**
- Modify: `apps/web/src/lib/coins.ts:87-150`
- Test: `apps/web/test/coins.test.ts`

**Interfaces:**
- Consumes: `THEMES`, `ThemeCosmetic`, `findCosmetic` from Task 1.
- Produces: `interface Equipped { badge: string | null; flair: string | null; theme: string | null }`; `buyItem(id)` accepts badges and themes; `equip('theme', id | null)`; `pushCosmetics()` posts `{ badge, flair }` only.

- [ ] **Step 1: Write the failing tests** — in `apps/web/test/coins.test.ts`, change every `readEquipped()` expectation to include `theme: null` (for example `{ badge: null, flair: null }` becomes `{ badge: null, flair: null, theme: null }`, and `{ badge: 'bolt', flair: null }` becomes `{ badge: 'bolt', flair: null, theme: null }`). Then append:

```ts
it('buys a theme for its price and equips it', () => {
  earnSome(50);
  const before = balance();
  expect(buyItem('paper')).toBe(true);
  expect(balance()).toBe(before - 400);
  expect(owned().has('paper')).toBe(true);
  expect(equip('theme', 'paper')).toBe(true);
  expect(readEquipped().theme).toBe('paper');
  expect(equip('theme', null)).toBe(true);
  expect(readEquipped().theme).toBeNull();
});

it('refuses a theme it cannot afford, and one it does not own', () => {
  expect(buyItem('synthwave')).toBe(false);
  expect(equip('theme', 'synthwave')).toBe(false);
  expect(equip('theme', 'bolt')).toBe(false);
});

it('drops an equipped theme once the epoch moves past its purchase', () => {
  earnSome(50);
  buyItem('paper');
  equip('theme', 'paper');
  const rewritten = readSpent().map((e) => (e.kind === 'item' && e.item === 'paper' ? { ...e, at: ACHIEVEMENTS_EPOCH - 1 } : e));
  localStorage.setItem('ph:coins:spent', JSON.stringify(rewritten));
  expect(readEquipped().theme).toBeNull();
});

it('never sends the theme to the server', async () => {
  earnSome(50);
  buyItem('paper');
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id: 'p', name: 'Mo' } }));
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  equip('theme', 'paper');
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
  expect(body).toEqual({ badge: null, flair: null });
  vi.unstubAllGlobals();
});
```

Before relying on the last test, open `apps/web/src/lib/api.ts` and `readSession()` and use the exact session key and shape they read; replace `'ph:session'` and the object above with that shape. If `earnSome(50)` does not reach 400 coins, raise it (each call earns 8 per Genius level plus 25 per unlocked achievement).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web test -- coins`
Expected: FAIL on `theme` missing from `readEquipped()` and `buyItem('paper')` returning false.

- [ ] **Step 3: Implement** — in `apps/web/src/lib/coins.ts`:

```ts
export function buyItem(id: string): boolean {
  const item = findCosmetic(id);
  if (!item || (item.kind !== 'badge' && item.kind !== 'theme') || owned().has(id) || balance() < item.price) return false;
  appendSpent({ kind: 'item', item: id, coins: item.price, at: Date.now() });
  return true;
}

export interface Equipped {
  badge: string | null;
  flair: string | null;
  theme: string | null;
}

export function readEquipped(): Equipped {
  try {
    const raw = readSetting(EQUIPPED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const v = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const ownedIds = owned();
    const pick = (kind: CosmeticKind) => (findCosmetic(v[kind])?.kind === kind && ownedIds.has(v[kind] as string) ? (v[kind] as string) : null);
    return { badge: pick('badge'), flair: pick('flair'), theme: pick('theme') };
  } catch {
    return { badge: null, flair: null, theme: null };
  }
}
```

In `pushCosmetics`:

```ts
    const { badge, flair } = readEquipped();
    await apiFetch('/cosmetics', { method: 'POST', body: JSON.stringify({ badge, flair }), auth: true });
```

Update the comment above `owned()` to say "Bought badges and themes plus earned flairs".

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @puzzle-hustle/web test` and `pnpm typecheck`
Expected: all pass. `Shop.tsx` and `Board.tsx` spread `Equipped` into `NameCell`; an extra `theme` field is harmless there, fix any type error by passing `{ name, badge: equipped.badge, flair: equipped.flair }`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/coins.ts apps/web/test/coins.test.ts
git commit -m "Let coins buy and equip a theme, and keep it off the server

Implemented with assistance from Claude Opus 5.5."
```

(Add `Shop.tsx`/`Board.tsx` if Step 4 touched them.)

---

### Task 3: Root attributes follow the active pack

**Files:**
- Modify: `apps/web/src/lib/accent.ts`
- Modify: `apps/web/src/lib/theme.ts`
- Modify: `apps/web/src/components/ThemeToggle.tsx`
- Create: `apps/web/test/theme.test.ts`

**Interfaces:**
- Consumes: `Equipped.theme`, `equip`, `buyItem` (Task 2); `findCosmetic`, `ThemeCosmetic` (Task 1).
- Produces, from `lib/theme.ts`: `activePack(): ThemeCosmetic | null`; `usePack(): ThemeCosmetic | null`; `tryOnPack(id: string | null, origin?: Origin): void`; `equipPack(id: string | null, origin?: Origin): boolean`; `refreshAppearance(): void`. From `lib/accent.ts`: `storedAccent(): Accent`.

- [ ] **Step 1: Write the failing test** — create `apps/web/test/theme.test.ts`:

```ts
import { beforeEach, expect, it } from 'vitest';
import { recordSolve, rehydrate } from '../src/lib/storage.ts';
import { buyItem } from '../src/lib/coins.ts';
import { activePack, equipPack, refreshAppearance, tryOnPack } from '../src/lib/theme.ts';

const root = document.documentElement;

function earnSome(n: number) {
  for (let i = 1; i <= n; i++) {
    recordSolve(`zip:level:genius:${i}`, { solvedAt: '2026-09-23T10:00:00.000Z', seconds: 60, hints: 0, moves: 10 });
  }
}

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  tryOnPack(null);
  equipPack(null);
  refreshAppearance();
});

it('without a pack keeps the stored mode and accent', () => {
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('ph:accent', 'iris');
  refreshAppearance();
  expect(root.dataset['theme']).toBe('dark');
  expect(root.dataset['accent']).toBe('iris');
  expect(root.dataset['pack']).toBeUndefined();
});

it('an equipped pack forces its mode, sets data-pack and drops the accent', () => {
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('ph:accent', 'iris');
  earnSome(50);
  buyItem('paper');
  expect(equipPack('paper')).toBe(true);
  expect(activePack()?.id).toBe('paper');
  expect(root.dataset['pack']).toBe('paper');
  expect(root.dataset['theme']).toBe('light');
  expect(root.dataset['accent']).toBeUndefined();
});

it('leaving the pack restores the stored mode and accent', () => {
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('ph:accent', 'iris');
  earnSome(50);
  buyItem('paper');
  equipPack('paper');
  equipPack(null);
  expect(root.dataset['pack']).toBeUndefined();
  expect(root.dataset['theme']).toBe('dark');
  expect(root.dataset['accent']).toBe('iris');
});

it('a try-on shows a pack without owning or saving it, and ends cleanly', () => {
  tryOnPack('synthwave');
  expect(root.dataset['pack']).toBe('synthwave');
  expect(root.dataset['theme']).toBe('dark');
  expect(localStorage.getItem('ph:cosmetics')).toBeNull();
  tryOnPack(null);
  expect(root.dataset['pack']).toBeUndefined();
});

it('ignores an unknown or non-theme id for a try-on', () => {
  tryOnPack('bolt');
  expect(root.dataset['pack']).toBeUndefined();
});
```

Before relying on the keys, confirm in `lib/storage.ts` that `readSetting('theme')` and `readSetting('ph:accent')` map to those exact `localStorage` keys; adjust the test if `readSetting` prefixes or caches.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web test -- theme`
Expected: FAIL, `activePack`/`equipPack`/`tryOnPack`/`refreshAppearance` are not exported.

- [ ] **Step 3: Implement `accent.ts`**

```ts
export function storedAccent(): Accent {
  const saved = readSetting('ph:accent') ?? '';
  return (ACCENTS as readonly string[]).includes(saved) ? (saved as Accent) : 'amber';
}

// Under a pack the accent attribute stays off, so no accent rule competes with the pack's tokens.
function apply() {
  const root = document.documentElement;
  if (!root.dataset['pack']) root.dataset['accent'] = storedAccent();
  for (const l of listeners) l();
}
```

Replace the private `stored()` with `storedAccent()` at its other call site (`useSyncExternalStore(subscribe, storedAccent)`).

- [ ] **Step 4: Implement `theme.ts`** — add imports:

```ts
import { findCosmetic, type ThemeCosmetic } from '@puzzle-hustle/core';
import { equip, readEquipped } from './coins.ts';
import { storedAccent } from './accent.ts';
```

Add pack state and replace `apply()`:

```ts
// A try-on shows a pack without buying or saving it; the shop clears it on the way out.
let trying: string | null = null;

export function activePack(): ThemeCosmetic | null {
  const item = findCosmetic(trying ?? readEquipped().theme);
  return item?.kind === 'theme' ? item : null;
}

function apply() {
  const root = document.documentElement;
  const pack = activePack();
  const theme = pack ? pack.mode : resolve(pref());
  root.dataset['theme'] = theme;
  if (pack) {
    root.dataset['pack'] = pack.id;
    delete root.dataset['accent'];
  } else {
    delete root.dataset['pack'];
    root.dataset['accent'] = storedAccent();
  }
  if (Capacitor.isNativePlatform()) {
    void StatusBarStyle.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' });
  }
  for (const l of listeners) l();
}

export function refreshAppearance() {
  apply();
}

export function tryOnPack(id: string | null, origin?: Origin) {
  trying = findCosmetic(id)?.kind === 'theme' ? id : null;
  reveal(origin, apply);
}

export function equipPack(id: string | null, origin?: Origin): boolean {
  trying = null;
  if (!equip('theme', id)) return false;
  reveal(origin, apply);
  return true;
}

export function usePack(): ThemeCosmetic | null {
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  useSyncExternalStore(subscribe, () => activePack()?.id ?? null);
  return activePack();
}
```

`useTheme()` keeps working: while a pack is active its `theme` still reports the stored preference, but its toggle is hidden (Step 5) and the Profile hides the preference (Task 4), so nothing reads it then.

- [ ] **Step 5: `ThemeToggle` renders nothing under a pack**

```tsx
import { centerOf, usePack, useTheme } from '../lib/theme.ts';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const pack = usePack();
  if (pack) return null;
  // ...unchanged body
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @puzzle-hustle/web test` and `pnpm typecheck`
Expected: all pass. If a circular import shows up at runtime (coins → … → theme), check with `pnpm --filter @puzzle-hustle/web build`; `coins.ts` must not import `theme.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/accent.ts apps/web/src/lib/theme.ts apps/web/src/components/ThemeToggle.tsx apps/web/test/theme.test.ts
git commit -m "Drive the root theme attributes from the equipped or tried-on pack

Implemented with assistance from Claude Opus 5.5."
```

---

### Task 4: Paper pack, contrast guard and the profile card

**Files:**
- Create: `apps/web/src/packs.css`
- Modify: `apps/web/src/main.tsx:15`
- Modify: `apps/web/src/theme.css` (body rule at line ~121)
- Modify: `apps/web/src/pages/Profile.tsx:100-128`
- Create: `apps/web/test/packs.test.ts`

**Interfaces:**
- Consumes: `THEMES` (Task 1); `usePack` (Task 3); `href`, `onLinkClick` from `lib/router.ts`.
- Produces: CSS blocks `[data-theme][data-pack="<id>"] { … }` with the token list below; `--pack-pattern` token read by `body`.

Every pack block sets exactly these tokens: `color-scheme`, `--bg`, `--card-bg`, `--text`, `--text-muted`, `--border`, `--border-mid`, `--board-cell`, `--board-line`, `--hover-bg`, `--hover-text`, `--accent`, `--accent-text`, `--accent-deep`, `--on-accent`, `--success`, `--success-soft`, `--danger`, `--shadow`, `--shadow-hover`, `--radius`, `--radius-sm`, `--nono-c2`, `--nono-c3`, `--pack-pattern`. The selector `[data-theme][data-pack="…"]` has two attributes, so it beats the single-attribute `[data-theme="dark"]` token blocks in `theme.css`, `nonogram.css`, `mosaic.css`, `regions.css` and `sudoku.css` whatever their load order. Game tokens a pack does not set (regions, sudoku, mosaic) come from the pack's mode.

- [ ] **Step 1: Write the failing test** — create `apps/web/test/packs.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { THEMES } from '@puzzle-hustle/core';

const css = readFileSync(new URL('../src/packs.css', import.meta.url), 'utf8');

function block(id: string): Record<string, string> {
  const m = css.match(new RegExp(`\\[data-theme\\]\\[data-pack="${id}"\\]\\s*\\{([^}]*)\\}`));
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const [, name, value] of m[1].matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const REQUIRED = ['--bg', '--card-bg', '--text', '--text-muted', '--border', '--border-mid', '--board-cell', '--board-line', '--hover-bg', '--hover-text', '--accent', '--accent-text', '--accent-deep', '--on-accent', '--success', '--success-soft', '--danger', '--shadow', '--shadow-hover', '--radius', '--radius-sm', '--nono-c2', '--nono-c3', '--pack-pattern', 'color-scheme'];

const DONE = ['paper'];

it.each(DONE)('%s sets every pack token and the scheme of its mode', (id) => {
  const b = block(id);
  for (const name of REQUIRED) expect(b, name).toHaveProperty(name);
  expect(b['color-scheme']).toBe(THEMES.find((t) => t.id === id)!.mode);
});

it.each(DONE)('%s keeps text readable', (id) => {
  const b = block(id);
  expect(contrast(b['--text'], b['--bg'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--text'], b['--card-bg'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--text-muted'], b['--card-bg'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--accent-text'], b['--bg'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--on-accent'], b['--accent'])).toBeGreaterThanOrEqual(4.5);
});
```

Colour tokens used in the contrast checks must be plain `#rrggbb` hex in `packs.css` so the test can read them.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web test -- packs`
Expected: FAIL, `packs.css` does not exist.

- [ ] **Step 3: Create `apps/web/src/packs.css`** with Paper:

```css
/* Theme packs. Each block sets every surface, text, board and accent token for one pack, and
   the pack forces its mode through data-theme. Two attributes in the selector let a pack beat
   the single-attribute [data-theme="dark"] blocks of every game stylesheet, whatever their
   load order; data-accent is off under a pack, so no accent rule competes. */

[data-theme][data-pack="paper"] {
  color-scheme: light;
  --bg: #f6f1e4;
  --card-bg: #fbf8f0;
  --text: #2b2a33;
  --text-muted: #625d51;
  --border: #e3dccb;
  --border-mid: #bfb59f;
  --board-cell: #fdfaf2;
  --board-line: #b9cde6;
  --hover-bg: #2b2a33;
  --hover-text: #fbf8f0;
  --accent: #2f5aa8;
  --accent-text: #2f5aa8;
  --accent-deep: #1f3f7a;
  --on-accent: #ffffff;
  --success: #3d8a52;
  --success-soft: rgba(61, 138, 82, 0.12);
  --danger: #c2483a;
  --shadow: 0 1px 3px rgba(60, 50, 20, 0.08);
  --shadow-hover: 0 4px 12px rgba(60, 50, 20, 0.12);
  --radius: 14px;
  --radius-sm: 10px;
  --nono-c2: #d9822b;
  --nono-c3: #b8508a;
  --pack-pattern: radial-gradient(rgba(120, 100, 60, 0.06) 1px, transparent 1px) 0 0 / 5px 5px;
}
```

- [ ] **Step 4: Hook the pattern and load the file**

In `apps/web/src/theme.css`, inside the `body { … }` rule, replace `background: var(--bg);` with:

```css
  background: var(--pack-pattern, none), var(--bg);
```

`--pack-pattern` is a full background layer (image, position and size), so an undefined token falls back to `none`. Verify in the browser that the Vexury look is unchanged; if the shorthand misparses, use `background-color: var(--bg); background-image: var(--pack-pattern-image, none); background-size: var(--pack-pattern-size, auto);` and split the Paper token into `--pack-pattern-image` and `--pack-pattern-size` (and adjust `REQUIRED` in the test).

In `apps/web/src/main.tsx`, directly after `import './theme.css';`:

```ts
import './packs.css';
```

- [ ] **Step 5: Profile appearance card** — in `Profile.tsx`, add `const pack = usePack();` next to `useTheme()`, import `usePack` from `../lib/theme.ts` and `href, onLinkClick` from `../lib/router.ts` (skip whichever is already imported), and change the card:

```tsx
        <div className="card-lg">
          <b>Appearance</b>
          {pack ? (
            <>
              <span className="muted small">Theme: {pack.title}</span>
              <a href={href('/shop')} className="pill outline" onClick={onLinkClick}>
                Change
              </a>
            </>
          ) : (
            <>
              <span className="muted small">System follows your device setting.</span>
              {/* existing segmented control and swatches, unchanged */}
            </>
          )}
        </div>
```

Move the existing `segmented` div, `swatches` div and the accent name `span` into the second fragment unchanged.

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @puzzle-hustle/web test`, `pnpm typecheck`, `pnpm --filter @puzzle-hustle/web build`
Expected: all pass.

- [ ] **Step 7: Look at it** — `pnpm --filter @puzzle-hustle/web exec vite preview --host 127.0.0.1 --port 4173`, open `http://127.0.0.1:4173/` at 360×780 in Playwright, run `localStorage.setItem('ph:cosmetics', JSON.stringify({ theme: 'paper' }))` is not enough (not owned), so instead run in the console: `document.documentElement.dataset.pack = 'paper'; document.documentElement.dataset.theme = 'light'; delete document.documentElement.dataset.accent;` and screenshot Daily, Profile and one puzzle of each type (`/play?t=<type>&d=easy&s=1`, types: shapes, nonogram, mosaic, crowns, stars, sudoku, killer, zip, tracks, slabs). Check: board lines visible, solved state still green, no unreadable text. Then reset the attributes and confirm Vexury is unchanged. Stop the preview server afterwards.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/packs.css apps/web/src/main.tsx apps/web/src/theme.css apps/web/src/pages/Profile.tsx apps/web/test/packs.test.ts
git commit -m "Add the Paper theme pack and hide mode and accent while a pack is on

Implemented with assistance from Claude Opus 5.5."
```

---

### Task 5: Themes section and try-on in the shop

**Files:**
- Modify: `apps/web/src/pages/Shop.tsx`
- Modify: `apps/web/src/theme.css` (append after the existing `.shop-*` rules)
- Test: `apps/web/test/shop.test.ts`

**Interfaces:**
- Consumes: `THEMES`, `ThemeCosmetic` (Task 1); `buyItem`, `Equipped.theme` (Task 2); `activePack`, `tryOnPack`, `equipPack`, `usePack`, `centerOf` (Task 3); `pushBackGuard` from `lib/back.ts`.
- Produces: `itemState` returns `'equipped'` for the equipped theme; the Themes section.

- [ ] **Step 1: Write the failing tests** — in `apps/web/test/shop.test.ts`, change `const none = { badge: null, flair: null };` to `const none = { badge: null, flair: null, theme: null };`, update the two inline `Equipped` literals to include `theme: null`, and append:

```ts
it('names the state of each theme pack', () => {
  expect(itemState('paper', new Set(['paper']), { ...none, theme: 'paper' }, 0)).toBe('equipped');
  expect(itemState('paper', new Set(['paper']), none, 0)).toBe('owned');
  expect(itemState('paper', new Set(), none, 400)).toBe('buyable');
  expect(itemState('paper', new Set(), none, 399)).toBe('locked');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web test -- shop`
Expected: FAIL on the `'equipped'` case.

- [ ] **Step 3: `itemState` knows themes**

```ts
  if (equipped.badge === id || equipped.flair === id || equipped.theme === id) return 'equipped';
```

- [ ] **Step 4: Themes section and try-on** — in `Shop.tsx` add imports `THEMES, type ThemeCosmetic` from core, `centerOf, equipPack, tryOnPack, usePack` from `../lib/theme.ts`, `pushBackGuard` from `../lib/back.ts`, `useRef` from react. Inside `Shop()`:

```tsx
  const active = usePack();
  const [trying, setTrying] = useState<ThemeCosmetic | null>(null);
  const tryingRef = useRef(trying);
  tryingRef.current = trying;

  const endTryOn = () => {
    tryOnPack(null);
    setTrying(null);
  };

  // The try-on never outlives the shop: leaving it, backgrounding the app or the back button
  // all put the equipped look back.
  useEffect(() => {
    const blur = () => endTryOn();
    window.addEventListener('appBlur', blur);
    window.addEventListener('pagehide', blur);
    const pop = pushBackGuard(() => {
      if (!tryingRef.current) return false;
      endTryOn();
      return true;
    });
    return () => {
      window.removeEventListener('appBlur', blur);
      window.removeEventListener('pagehide', blur);
      pop();
      tryOnPack(null);
    };
  }, []);

  const tapTheme = (item: ThemeCosmetic | null, event: React.MouseEvent<HTMLElement>) => {
    const origin = centerOf(event.currentTarget);
    if (item === null || ownedIds.has(item.id)) {
      setTrying(null);
      equipPack(item?.id ?? null, origin);
      return;
    }
    setTrying(item);
    tryOnPack(item.id, origin);
  };

  const buyTheme = () => {
    if (!trying || !buyItem(trying.id)) return;
    setTrying(null);
    equipPack(trying.id);
  };

  const themeLabel = (item: ThemeCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') return 'Equipped';
    if (state === 'owned') return 'Owned';
    return `${item.price}`;
  };
```

Render, directly above the Badges section:

```tsx
        <section className="card-lg">
          <h2>Themes</h2>
          <div className="theme-grid">
            <button type="button" className={`theme-card${!active && !trying ? ' equipped' : ''}`} onClick={(e) => tapTheme(null, e)} aria-label="Vexury, free">
              <MiniBoard mode={vexuryMode} accent={storedAccent()} />
              <b className="small">Vexury</b>
              <span className="small">{!equipped.theme ? 'Equipped' : 'Free'}</span>
            </button>
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`theme-card ${itemState(item.id, ownedIds, equipped, balance)}${trying?.id === item.id ? ' trying' : ''}`}
                onClick={(e) => tapTheme(item, e)}
                aria-label={`${item.title}, ${themeLabel(item)}`}
              >
                <MiniBoard pack={item} />
                <b className="small">{item.title}</b>
                <span className="small">{themeLabel(item)}</span>
              </button>
            ))}
          </div>
        </section>
```

After the closing `</div>` of `.stack`, the try-on bar:

```tsx
      {trying && (
        <div className="tryon-bar" role="region" aria-label={`Trying ${trying.title}`}>
          <button type="button" className="pill outline" onClick={endTryOn}>
            Back
          </button>
          <button type="button" className="pill" onClick={buyTheme} disabled={balance < trying.price}>
            {balance < trying.price ? `Need ${trying.price - balance} more` : `Buy for ${trying.price}`}
          </button>
        </div>
      )}
```

Below the component, the preview (it carries the pack's own attributes, so its custom properties are the pack's):

```tsx
// Nine cells in a pack's own colours: its attributes on this element make the same token block
// apply here as on the whole app. The Vexury card passes its stored mode and accent instead,
// because under a pack the root carries neither.
function MiniBoard({ pack, mode, accent }: { pack?: ThemeCosmetic; mode?: string; accent?: string }) {
  return (
    <span className="mini-board" data-theme={pack?.mode ?? mode} data-pack={pack?.id} data-accent={pack ? undefined : accent} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={i === 4 ? 'on' : undefined} />
      ))}
    </span>
  );
}
```

For the Vexury card, import `storedAccent` from `../lib/accent.ts` and `useTheme` from `../lib/theme.ts`, and inside `Shop()` add `const { theme: vexuryMode } = useTheme();` (`useTheme().theme` resolves the stored preference and ignores packs). The `[data-theme="dark"]` token block and the `[data-accent="…"]` blocks match this span as well as the root, so it shows the Vexury look even while a pack is on. Light mode needs no attribute block: if a dark pack is active, verify the Vexury card in light mode still looks light; if it inherits dark tokens, add to `theme.css` a `[data-theme="light"]` block repeating the light `:root` surface tokens (`--bg`, `--card-bg`, `--board-cell`, `--board-line`, `--text`).

- [ ] **Step 5: Styles** — append to `apps/web/src/theme.css`:

```css
/* Theme packs in the shop: a grid of cards, each with a mini board in that pack's colours. */
.theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.theme-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 6px; border-radius: var(--radius-sm); border: 2px solid var(--border);
  background: var(--card-bg); color: var(--text); cursor: pointer;
}
.theme-card.equipped, .theme-card.trying { border-color: var(--accent); }
.theme-card.locked { opacity: 0.8; }
.mini-board {
  display: grid; grid-template-columns: repeat(3, 18px); gap: 2px; padding: 6px;
  border-radius: 8px; background: var(--bg); border: 2px solid var(--board-line);
  background-image: var(--pack-pattern, none);
}
.mini-board i { display: block; width: 18px; height: 18px; border-radius: 3px; background: var(--board-cell); }
.mini-board i.on { background: var(--accent); }
.tryon-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  display: flex; gap: 10px; justify-content: flex-end;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: var(--card-bg); border-top: 1px solid var(--border); box-shadow: var(--shadow-hover);
}
```

If `.mini-board` inherits `background` from the pattern token incorrectly (the token includes position and size), use the split tokens from Task 4 Step 4.

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @puzzle-hustle/web test`, `pnpm typecheck`, `pnpm --filter @puzzle-hustle/web build`
Expected: all pass.

- [ ] **Step 7: Try it** — preview at 360×780 in Playwright, open `/shop`: seven cards fit without horizontal scroll; tapping Paper lays it over the page and shows the bar with "Need … more"; Back restores the look; navigating away from `/shop` during a try-on restores the look. Earn coins by solving Genius levels via hints if a buy needs checking (the web has free hints, see Play), or seed `ph:solves` as in the tests through the console, then buy Paper and confirm it stays after a reload. Screenshot the shop in Vexury light, Vexury dark and Paper. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/Shop.tsx apps/web/src/theme.css apps/web/test/shop.test.ts
git commit -m "Add a Themes section to the shop with try-on before buying

Implemented with assistance from Claude Opus 5.5."
```

---

### Task 6: The other five packs

**Files:**
- Modify: `apps/web/src/packs.css`
- Modify: `apps/web/test/packs.test.ts` (`DONE`)

**Interfaces:**
- Consumes: the token list and selector form from Task 4.

- [ ] **Step 1: Extend the test** — in `packs.test.ts` replace `const DONE = ['paper'];` with:

```ts
const DONE = THEMES.map((t) => t.id);
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web test -- packs`
Expected: FAIL for sakura, midnight, cat-cafe, terminal, synthwave.

- [ ] **Step 3: Add the blocks** — append to `packs.css`:

```css
[data-theme][data-pack="sakura"] {
  color-scheme: light;
  --bg: #fbf0f2;
  --card-bg: #ffffff;
  --text: #3a2a30;
  --text-muted: #765f69;
  --border: #f0dce2;
  --border-mid: #d9b8c3;
  --board-cell: #fff7f9;
  --board-line: #efd3dc;
  --hover-bg: #3a2a30;
  --hover-text: #ffffff;
  --accent: #e0567f;
  --accent-text: #b0305b;
  --accent-deep: #b0305b;
  --on-accent: #3a0a1c;
  --success: #3d9a5c;
  --success-soft: rgba(61, 154, 92, 0.12);
  --danger: #b8322a;
  --shadow: 0 2px 10px rgba(180, 80, 110, 0.10);
  --shadow-hover: 0 6px 18px rgba(180, 80, 110, 0.16);
  --radius: 22px;
  --radius-sm: 16px;
  --nono-c2: #3f7fc4;
  --nono-c3: #3f9a4f;
  --pack-pattern: none;
}

[data-theme][data-pack="midnight"] {
  color-scheme: dark;
  --bg: #000000;
  --card-bg: #0d0d0f;
  --text: #e8e8ea;
  --text-muted: #8b8d94;
  --border: #1c1c20;
  --border-mid: #34353b;
  --board-cell: #0a0a0c;
  --board-line: #1f2025;
  --hover-bg: #e8e8ea;
  --hover-text: #000000;
  --accent: #9ecbff;
  --accent-text: #9ecbff;
  --accent-deep: #9ecbff;
  --on-accent: #04121f;
  --success: #4fbf77;
  --success-soft: rgba(79, 191, 119, 0.14);
  --danger: #e0645a;
  --shadow: none;
  --shadow-hover: none;
  --radius: 18px;
  --radius-sm: 12px;
  --nono-c2: #f0a050;
  --nono-c3: #d06aa4;
  --pack-pattern: none;
}

[data-theme][data-pack="cat-cafe"] {
  color-scheme: light;
  --bg: #efe4d6;
  --card-bg: #f8f1e8;
  --text: #3b2a1e;
  --text-muted: #6f5a48;
  --border: #e2d3c1;
  --border-mid: #c3ab91;
  --board-cell: #f6ecdf;
  --board-line: #d8c4ad;
  --hover-bg: #3b2a1e;
  --hover-text: #f8f1e8;
  --accent: #c07a3a;
  --accent-text: #8a4f1c;
  --accent-deep: #8a4f1c;
  --on-accent: #2a1a0e;
  --success: #3d8a52;
  --success-soft: rgba(61, 138, 82, 0.12);
  --danger: #b8392c;
  --shadow: 0 1px 4px rgba(80, 50, 20, 0.10);
  --shadow-hover: 0 4px 14px rgba(80, 50, 20, 0.14);
  --radius: 18px;
  --radius-sm: 12px;
  --nono-c2: #3f7fc4;
  --nono-c3: #9a5cc9;
  --pack-pattern: none;
}

[data-theme][data-pack="terminal"] {
  color-scheme: dark;
  --font-text: 'Inconsolata', ui-monospace, monospace;
  --bg: #0a0c0a;
  --card-bg: #101410;
  --text: #ffd28a;
  --text-muted: #b08a4a;
  --border: #2a2412;
  --border-mid: #5a4a20;
  --board-cell: #0d100d;
  --board-line: #3a3016;
  --hover-bg: #ffb000;
  --hover-text: #0a0c0a;
  --accent: #ffb000;
  --accent-text: #ffb000;
  --accent-deep: #ffc84a;
  --on-accent: #1a1200;
  --success: #7ddc6a;
  --success-soft: rgba(125, 220, 106, 0.14);
  --danger: #ff5f4a;
  --shadow: 0 0 8px rgba(255, 176, 0, 0.10);
  --shadow-hover: 0 0 14px rgba(255, 176, 0, 0.22);
  --radius: 4px;
  --radius-sm: 2px;
  --nono-c2: #5d9be0;
  --nono-c3: #d06aa4;
  --pack-pattern: repeating-linear-gradient(to bottom, rgba(255, 176, 0, 0.025) 0 1px, transparent 1px 3px);
}

[data-theme][data-pack="synthwave"] {
  color-scheme: dark;
  --bg: #1a0f2e;
  --card-bg: #24163d;
  --text: #f4e9ff;
  --text-muted: #b39ccf;
  --border: #3a2660;
  --border-mid: #5d3f8f;
  --board-cell: #1f1236;
  --board-line: #4a2f78;
  --hover-bg: #ff4fd8;
  --hover-text: #1a0f2e;
  --accent: #ff4fd8;
  --accent-text: #ff7fe3;
  --accent-deep: #ff7fe3;
  --on-accent: #2a0822;
  --success: #4fe08a;
  --success-soft: rgba(79, 224, 138, 0.14);
  --danger: #ff5a5a;
  --shadow: 0 0 10px rgba(255, 79, 216, 0.12);
  --shadow-hover: 0 0 18px rgba(255, 79, 216, 0.24);
  --radius: 14px;
  --radius-sm: 10px;
  --nono-c2: #3ff0ff;
  --nono-c3: #ffb347;
  --pack-pattern: linear-gradient(to bottom, transparent 55%, rgba(255, 79, 216, 0.10)) fixed;
}

[data-pack="synthwave"] .board-frame { box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 45%, transparent); }
[data-pack="terminal"] .board-frame { box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 30%, transparent); }
```

- [ ] **Step 4: Run tests; tune until the contrast guard passes**

Run: `pnpm --filter @puzzle-hustle/web test -- packs`
Expected: PASS. If a contrast check fails, darken (light packs) or lighten (dark packs) the failing token in small steps and re-run; never touch `--success`/`--danger` hues beyond lightness.

- [ ] **Step 5: Look at every pack** — as in Task 4 Step 7, set each pack's attributes in Playwright at 360×780 and screenshot Daily, Shop, Profile and all ten puzzle types; mark anything unreadable or clashing (Cats/Hearts region colours on Midnight and Synthwave, Nonogram colours, the solved green frame). Tune tokens in `packs.css` only. Show the screenshots to Moritz before committing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/packs.css apps/web/test/packs.test.ts
git commit -m "Add the Sakura, Midnight, Cat Café, Terminal and Synthwave packs

Implemented with assistance from Claude Opus 5.5."
```

---

### Task 7: Device check and wiki

**Files:** none in the repo unless the check finds something.

- [ ] **Step 1: S23 via web preview** — build, `vite preview --host 127.0.0.1 --port 4173`, `adb reverse tcp:4173 tcp:4173` (adb at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`), open `http://localhost:4173/shop` in the phone's Chrome with `adb shell am start -a android.intent.action.VIEW -d '<url>' com.android.chrome`. Check try-on, Back, a buy after seeding coins, and the look of one light and one dark pack via `adb exec-out screencap -p`. Remove the reverse and stop the server afterwards. The Play install stays untouched.
- [ ] **Step 2: Full suite** — `pnpm test` and `pnpm typecheck` at the root.
- [ ] **Step 3: Ask before pushing** — pushing to `github` deploys the web version; ask Moritz, then `git push origin main` and `git push github main`.
- [ ] **Step 4: Wiki** — propose a `sync-wiki` entry for `~/hub/wiki/puzzle-hustle.md`: decision 2026-09-25 theme packs (fixed mode, bought only, prices, try-on), and the root-attribute rule (`data-pack` plus forced `data-theme`, `data-accent` off under a pack).

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { percentileText, readHidden, NameCell, OpenRow, rowCosmetics, splitHidden, StandingsRow, writeHidden } from '../src/components/Board.tsx';

it('hides the line when there is no percentile at all', () => {
  expect(percentileText(null, 'daily')).toBeNull();
});

it('hides the line just under the 20-submission floor', () => {
  expect(percentileText({ total: 19, faster: 0 }, 'daily')).toBeNull();
});

it('shows the line right at the 20-submission floor', () => {
  expect(percentileText({ total: 20, faster: 5 }, 'daily')).not.toBeNull();
});

it('excludes the player from both sides of the fraction', () => {
  // 21 submissions total, 5 faster than the player: the other 20 players are the field,
  // 15 of them the player beat, so 15/20 = 75%, not 15/21 or 16/21.
  expect(percentileText({ total: 21, faster: 5 }, 'daily')).toBe('beat 75% of players today');
});

it('reads 0% for the slowest run in a field of exactly 20', () => {
  expect(percentileText({ total: 20, faster: 19 }, 'daily')).toBe('beat 0% of players today');
});

it('reads 100% for the fastest run once the field passes 20', () => {
  expect(percentileText({ total: 21, faster: 0 }, 'daily')).toBe('beat 100% of players today');
});

it('says "this week" for a weekly board and "this month" for a monthly one', () => {
  expect(percentileText({ total: 21, faster: 5 }, 'weekly')).toBe('beat 75% of players this week');
  expect(percentileText({ total: 21, faster: 5 }, 'monthly')).toBe('beat 75% of players this month');
});

it('resolves known cosmetics and hides unknown ones, missing fields and wrong kinds', () => {
  expect(rowCosmetics({ badge: 'cat', flair: 'puzzler' })).toMatchObject({ badge: { id: 'cat' }, flair: { title: 'Puzzler' } });
  expect(rowCosmetics({ badge: 'from-the-future', flair: null })).toEqual({ badge: undefined, flair: undefined });
  expect(rowCosmetics({})).toEqual({ badge: undefined, flair: undefined });
  expect(rowCosmetics({ badge: 'puzzler', flair: 'cat' })).toEqual({ badge: undefined, flair: undefined });
});

it('hides chosen players but never the viewer', () => {
  const entries = [{ playerId: 'me' }, { playerId: 'a' }, { playerId: 'b' }];
  const { shown, hidden } = splitHidden(entries, ['a', 'me'], 'me');
  expect(shown.map((e) => e.playerId)).toEqual(['me', 'b']);
  expect(hidden.map((e) => e.playerId)).toEqual(['a']);
});

it('keeps the full-board rank when players above are hidden', () => {
  const entries = [{ playerId: 'a' }, { playerId: 'me' }, { playerId: 'b' }, { playerId: 'c' }];
  const { shown } = splitHidden(entries, ['a', 'b'], 'me');
  expect(shown.map((e) => [e.playerId, e.rank])).toEqual([
    ['me', 2],
    ['c', 4],
  ]);
});

it('stores hidden players once and survives a corrupt setting', () => {
  localStorage.setItem('ph:hidden', '{nope');
  expect(readHidden()).toEqual([]);
  writeHidden(['a', 'a', 'b']);
  expect(readHidden()).toEqual(['a', 'b']);
  localStorage.setItem('ph:hidden', JSON.stringify(['a', 7]));
  expect(readHidden()).toEqual(['a']);
});

it('shows the Hustle chip only from level 1', () => {
  const html = (hustle?: number) => renderToStaticMarkup(createElement(NameCell, { entry: { name: 'A', hustle } }));
  expect(html(47)).toContain('Lv 47');
  expect(html(0)).not.toContain('Lv');
  expect(html(undefined)).not.toContain('Lv');
});

it('shows the showcase behind the name, tinted by rarity, and the nameplate behind the row', () => {
  const row = (entry: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(StandingsRow, { entry: { name: 'Mo', seconds: 24, hints: 0, ...entry }, rank: 4, me: false }));
  const plated = row({ badge: 'owl', badges: ['owl', 'hustle-crown', 'from-the-future'], nameplate: 'plate-midnight' });
  expect(plated).toContain('leaderboard-row np np-midnight np-dark');
  expect(plated).toContain('rarity-legendary');
  expect(plated).toContain('rarity-hustle');
  expect(plated.match(/class="row-badge"/g)).toHaveLength(2);
  // A row from a server before the showcase carries only its badge.
  expect(row({ badge: 'bolt' })).toContain('rarity-common');
  const plain = row({ badge: null, nameplate: 'from-the-future' });
  expect(plain).toContain('<li class="leaderboard-row">');
  expect(plain).not.toContain('row-badges');
});

it('keeps the name line to the name and level, the showcase and flair go below, hints as a count', () => {
  const row = renderToStaticMarkup(
    createElement(StandingsRow, { entry: { name: 'Michaela', seconds: 209, hints: 2, hustle: 140, badges: ['owl', 'bolt'], flair: 'night-shift' }, rank: 5, me: false }),
  );
  const nameLine = row.slice(row.indexOf('class="leaderboard-name"'), row.indexOf('class="leaderboard-sub"'));
  expect(nameLine).toContain('Michaela');
  expect(nameLine).toContain('Lv 140');
  expect(nameLine).not.toContain('row-badge');
  const sub = row.slice(row.indexOf('class="leaderboard-sub"'));
  expect(sub.indexOf('row-badges')).toBeLessThan(sub.indexOf('leaderboard-flair'));
  expect(row).toContain('aria-label="2 hints"');
  expect(row).not.toContain('hints</span>');
});

it('shows a member without a time by name and level, no plate, no showcase', () => {
  const row = renderToStaticMarkup(createElement(OpenRow, { name: 'Pia', hustle: 120, me: true }));
  expect(row).toContain('<li class="leaderboard-row open me">');
  expect(row).toContain('Pia');
  expect(row).toContain('Lv 120');
  expect(row).not.toMatch(/np-|row-badge/);
  expect(renderToStaticMarkup(createElement(OpenRow, { name: 'Ben', me: false }))).not.toContain('hustle-chip');
});

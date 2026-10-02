// Coin economy simulation: player types over a year, with the real earning rules (coinsEarned with
// achievements, Hustle milestones, the random cap, doubled solves) and the real catalogue prices.
// Calibrated 2026-10-02 against the report and the scores table: dailies take about the star target,
// and about 2 % of dailies get a hint (STUCK 0.25 of the persona values).
// Usage: pnpm economy-sim [runs]; env HINTP (hint price), STUCK (hint demand factor),
// TAKE (share of double-coin videos accepted, default 0.5), INCOME (earning factor), ONLY=Name,Name.
import {
  coinsEarned, unlockedAchievements, DAILY_TYPES, PUZZLE_TYPES, periodKey, periodPuzzleType, periodDifficulty,
  hustleSlot, starTarget, HINT_PRICE, THEMES, NAMEPLATES, COSMETICS, type SolveEntry, type Difficulty, type PuzzleTypeId,
} from '../src/index.ts';

const BADGES = COSMETICS.filter((c) => c.kind === 'badge' && !c.requires) as { id: string; price: number; kind: string }[];
type ShopKind = 'theme' | 'nameplate' | 'badge';
const SHOP: { id: string; kind: ShopKind; price: number }[] = [
  ...THEMES.map((t) => ({ id: t.id, kind: 'theme' as const, price: t.price })),
  ...NAMEPLATES.map((t) => ({ id: t.id, kind: 'nameplate' as const, price: t.price })),
  ...BADGES.map((b) => ({ id: b.id, kind: 'badge' as const, price: b.price })),
];
const TOTAL: Record<ShopKind, number> = { theme: 0, nameplate: 0, badge: 0 };
const COUNT: Record<ShopKind, number> = { theme: 0, nameplate: 0, badge: 0 };
for (const s of SHOP) { TOTAL[s.kind] += s.price; COUNT[s.kind]++; }

class R { s: number; constructor(s: number) { this.s = s >>> 0 || 1; } next() { this.s ^= this.s << 13; this.s >>>= 0; this.s ^= this.s >> 17; this.s ^= this.s << 5; this.s >>>= 0; return this.s / 4294967296; } }

type HintPolicy = 'free-coins-video' | 'free-video-coins' | 'web' | 'unlimited' | 'free-only';
type ShopPolicy = 'themes-first' | 'cheapest' | 'plates-first' | 'never' | 'badges-first';
interface Persona {
  name: string; desc: string;
  playChance: (day: number, dow: number) => number;  // probability of opening the app that day
  dailies: number;            // how many of the 9 dailies on a played day (9 = clean sweep)
  weekly: number; monthly: number; // chance to solve the weekly/monthly when it is open and played
  levels: number;             // pack levels per played day
  randoms: number;            // randoms per played day
  hustle: number;             // hustle stages per played day
  skill: number;              // time multiplier (1 = star target pace * 1.4)
  stuck: number;              // base chance to want a hint on a medium puzzle
  videoWill: number;          // chance to accept a video when offered
  hint: HintPolicy; shop: ShopPolicy; reserve: number; // coins kept back for hints
  hour: number;               // Berlin hour of play
}

const TAKE = Number(process.env.TAKE ?? 0.5);
const DIFF_W: Record<Difficulty, number> = { easy: 0.35, medium: 0.7, hard: 1.1, genius: 1.6 };
const DIFF_F: Record<Difficulty, number> = { easy: 0.5, medium: 1, hard: 2, genius: 3.5 };
const LEVEL_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'genius'];

const everyDay = () => 1;
const PERSONAS: Persona[] = [
  { name: 'Casual', desc: '4 Tage/Woche, 3 Dailys, sonst nichts', playChance: () => 4 / 7, dailies: 3, weekly: 0.2, monthly: 0.1, levels: 0, randoms: 0, hustle: 0, skill: 1.3, stuck: 0.25, videoWill: 0.5, hint: 'free-coins-video', shop: 'cheapest', reserve: 0, hour: 20 },
  { name: 'Casual-Web', desc: 'wie Casual, aber Web (kein Video)', playChance: () => 4 / 7, dailies: 3, weekly: 0.2, monthly: 0.1, levels: 0, randoms: 0, hustle: 0, skill: 1.3, stuck: 0.25, videoWill: 0, hint: 'web', shop: 'cheapest', reserve: 0, hour: 20 },
  { name: 'Daily-5', desc: 'taeglich 5 Dailys, Weekly oft', playChance: () => 0.9, dailies: 5, weekly: 0.6, monthly: 0.4, levels: 0, randoms: 0, hustle: 0, skill: 1.1, stuck: 0.15, videoWill: 0.4, hint: 'free-coins-video', shop: 'themes-first', reserve: 0, hour: 8 },
  { name: 'Sweeper', desc: 'taeglich alle 9 Dailys + Weekly + Monthly (Danielas Muster)', playChance: () => 0.97, dailies: 9, weekly: 0.95, monthly: 0.9, levels: 0, randoms: 0, hustle: 0, skill: 1.0, stuck: 0.12, videoWill: 0.3, hint: 'free-coins-video', shop: 'themes-first', reserve: 40, hour: 21 },
  { name: 'Sweeper-NoHint', desc: 'Sweeper, Profi, braucht kaum Hints', playChance: () => 0.97, dailies: 9, weekly: 1, monthly: 1, levels: 0, randoms: 0, hustle: 0, skill: 0.7, stuck: 0.03, videoWill: 0, hint: 'free-only', shop: 'themes-first', reserve: 0, hour: 7 },
  { name: 'Struggler', desc: 'taeglich 6 Dailys, haengt oft, nutzt Coins fuer Hints', playChance: () => 0.85, dailies: 6, weekly: 0.5, monthly: 0.3, levels: 0, randoms: 0, hustle: 0, skill: 1.6, stuck: 0.45, videoWill: 0.2, hint: 'free-coins-video', shop: 'cheapest', reserve: 0, hour: 19 },
  { name: 'Struggler-Video', desc: 'wie Struggler, nimmt lieber Videos', playChance: () => 0.85, dailies: 6, weekly: 0.5, monthly: 0.3, levels: 0, randoms: 0, hustle: 0, skill: 1.6, stuck: 0.45, videoWill: 0.9, hint: 'free-video-coins', shop: 'cheapest', reserve: 0, hour: 19 },
  { name: 'Level-Climber', desc: 'Sweeper + 10 Pack-Level/Tag', playChance: () => 0.95, dailies: 9, weekly: 0.9, monthly: 0.8, levels: 10, randoms: 0, hustle: 0, skill: 1.0, stuck: 0.15, videoWill: 0.4, hint: 'free-coins-video', shop: 'themes-first', reserve: 40, hour: 22 },
  { name: 'Hustler', desc: '5 Dailys + 25 Hustle-Stufen/Tag', playChance: () => 0.95, dailies: 5, weekly: 0.5, monthly: 0.5, levels: 0, randoms: 0, hustle: 25, skill: 0.9, stuck: 0.12, videoWill: 0.5, hint: 'free-coins-video', shop: 'plates-first', reserve: 40, hour: 23 },
  { name: 'Whale-Grinder', desc: 'alles: Sweep, 15 Level, 10 Random, 30 Hustle', playChance: everyDay, dailies: 9, weekly: 1, monthly: 1, levels: 15, randoms: 10, hustle: 30, skill: 0.8, stuck: 0.1, videoWill: 0.3, hint: 'free-coins-video', shop: 'cheapest', reserve: 60, hour: 1 },
  { name: 'Weekend', desc: 'nur Sa/So, alle Dailys + Weekly', playChance: (_d, dow) => (dow === 0 || dow === 6 ? 0.9 : 0.05), dailies: 9, weekly: 0.9, monthly: 0.5, levels: 3, randoms: 0, hustle: 5, skill: 1.1, stuck: 0.2, videoWill: 0.4, hint: 'free-coins-video', shop: 'themes-first', reserve: 0, hour: 15 },
  { name: 'Lapsed', desc: '2 Wochen Sweep, dann 1x/Woche 3 Dailys', playChance: (d) => (d < 14 ? 1 : 1 / 7), dailies: 9, weekly: 0.7, monthly: 0.5, levels: 3, randoms: 2, hustle: 5, skill: 1.1, stuck: 0.2, videoWill: 0.4, hint: 'free-coins-video', shop: 'cheapest', reserve: 0, hour: 20 },
  { name: 'Buyer', desc: 'Sweeper mit Kauf No Ads/Free Hints', playChance: () => 0.97, dailies: 9, weekly: 0.95, monthly: 0.9, levels: 5, randoms: 0, hustle: 10, skill: 1.0, stuck: 0.2, videoWill: 0, hint: 'unlimited', shop: 'themes-first', reserve: 0, hour: 21 },
];

const INCOME = Number(process.env.INCOME ?? 1);
const HP = Number(process.env.HINTP ?? HINT_PRICE);
const ONLY = process.env.ONLY?.split(',');
const START = Date.parse('2026-11-01T00:00:00+01:00');
const DAY = 86400000;
const CHECKPOINTS = [7, 30, 90, 180, 365];

interface Stats {
  earned: number; spentHints: number; spentItems: number; minutes: number; playedDays: number; solves: number;
  want: number; free: number; coins: number; video: number; denied: number; unlimited: number;
  owned: Record<ShopKind, number>; firstBuy: Record<ShopKind, number | null>; allOf: Record<ShopKind, number | null>;
  allShop: number | null; snap: Record<number, { earned: number; balance: number; owned: Record<ShopKind, number>; spentHints: number; hustle: number; ach: number }>;
}

function simulate(p: Persona, seed: number, days = 365): Stats {
  const rng = new R(seed * 7919 + 17);
  const solves: SolveEntry[] = [];
  const st: Stats = { earned: 0, spentHints: 0, spentItems: 0, minutes: 0, playedDays: 0, solves: 0, want: 0, free: 0, coins: 0, video: 0, denied: 0, unlimited: 0,
    owned: { theme: 0, nameplate: 0, badge: 0 }, firstBuy: { theme: null, nameplate: null, badge: null }, allOf: { theme: null, nameplate: null, badge: null }, allShop: null, snap: {} };
  const ownedIds = new Set<string>();
  const levelPos: Record<string, number> = {}; // type -> index into level ladder (difficulty*30 + n)
  let hustleNext = 1;
  let spent = 0;
  let typeCursor = 0;
  let earnedSoFar = 0;
  const doubled = new Set<string>();

  for (let d = 0; d < days; d++) {
    const dayStart = START + d * DAY;
    const date = new Date(dayStart + 12 * 3600000);
    const dow = date.getUTCDay();
    const balanceStart = Math.max(0, earnedSoFar - spent);
    let budget = balanceStart;
    let freeLeft = true;
    if (rng.next() < p.playChance(d, dow)) {
      st.playedDays++;
      let t = dayStart + p.hour * 3600000 + rng.next() * 1800000;
      const solve = (id: string, type: PuzzleTypeId, diff: Difficulty) => {
        const base = starTarget(type, 'medium') * DIFF_F[diff] * p.skill;
        let secs = base * (0.6 + rng.next() * 0.9);
        let hints = 0;
        const pStuck = Math.min(0.95, p.stuck * Number(process.env.STUCK ?? 0.25) * DIFF_W[diff]);
        if (rng.next() < pStuck) {
          const want = 1 + (rng.next() < 0.35 ? 1 : 0) + (rng.next() < 0.1 ? 1 : 0);
          for (let i = 0; i < want; i++) {
            st.want++;
            let got: 'free' | 'coins' | 'video' | 'unlimited' | null = null;
            if (p.hint === 'unlimited') got = 'unlimited';
            else if (freeLeft) { got = 'free'; freeLeft = false; }
            else {
              const tryCoins = () => (p.hint !== 'free-only' && budget >= HP ? 'coins' : null);
              const tryVideo = () => (p.hint !== 'web' && p.hint !== 'free-only' && rng.next() < p.videoWill ? 'video' : null);
              got = p.hint === 'free-video-coins' ? (tryVideo() ?? tryCoins()) : (tryCoins() ?? tryVideo());
            }
            if (got === 'coins') { budget -= HP; spent += HP; st.spentHints += HP; }
            if (got) { st[got]++; hints++; } else { st.denied++; secs *= 1.4; }
          }
        }
        if (hints > 0) secs *= 0.85;
        t += secs * 1000 + 20000;
        solves.push({ id, solvedAt: Math.round(t), seconds: Math.round(secs), hints, moves: 30 });
        if (id.includes(':daily:') || id.includes(':weekly:') || id.includes(':monthly:')) {
          if (p.hint === 'unlimited' || (p.hint !== 'web' && rng.next() < TAKE)) doubled.add(id);
        }
        st.minutes += secs / 60 + 0.3;
        st.solves++;
      };
      const dkey = periodKey('daily', date);
      const types = [...DAILY_TYPES].sort(() => rng.next() - 0.5).slice(0, p.dailies);
      for (const type of types) solve(`${type}:daily:${dkey}`, type, periodDifficulty(type, 'daily'));
      for (const period of ['weekly', 'monthly'] as const) {
        const key = periodKey(period, date);
        const id = `${periodPuzzleType(period, key)}:${period}:${key}`;
        if (!solves.some((s) => s.id === id) && rng.next() < (period === 'weekly' ? p.weekly : p.monthly) / (period === 'weekly' ? 3 : 10)) {
          const type = periodPuzzleType(period, key);
          solve(id, type, periodDifficulty(type, period));
        }
      }
      for (let i = 0; i < p.levels; i++) {
        const type = PUZZLE_TYPES[typeCursor++ % PUZZLE_TYPES.length]!;
        const pos = levelPos[type] ?? 0;
        if (pos >= 120) continue;
        levelPos[type] = pos + 1;
        const diff = LEVEL_ORDER[Math.floor(pos / 30)]!;
        solve(`${type}:level:${diff}:${(pos % 30) + 1}`, type, diff);
      }
      for (let i = 0; i < p.randoms; i++) {
        const type = PUZZLE_TYPES[Math.floor(rng.next() * PUZZLE_TYPES.length)]!;
        solve(`${type}:medium:${Math.floor(rng.next() * 1e9).toString(36)}`, type, 'medium');
      }
      for (let i = 0; i < p.hustle; i++) {
        const slot = hustleSlot(hustleNext);
        solve(`hustle:${hustleNext}`, slot.type, slot.difficulty);
        hustleNext++;
      }
    }
    // Shopping at the end of the day.
    earnedSoFar = Math.round(coinsEarned(solves, START, doubled) * INCOME);
    if (p.shop !== 'never') {
      let balance = Math.max(0, earnedSoFar - spent);
      const want = SHOP.filter((s) => !ownedIds.has(s.id));
      const rank = (s: { kind: string; price: number }) => {
        const pri = p.shop === 'themes-first' ? { theme: 0, nameplate: 1, badge: 2 } : p.shop === 'plates-first' ? { nameplate: 0, theme: 1, badge: 2 } : p.shop === 'badges-first' ? { badge: 0, nameplate: 1, theme: 2 } : { theme: 0, nameplate: 0, badge: 0 };
        return (pri as Record<string, number>)[s.kind]! * 1e5 + s.price;
      };
      want.sort((a, b) => rank(a) - rank(b));
      for (const item of want) {
        // Saves up for the top wish instead of buying cheaper things around it, except "cheapest".
        if (balance - p.reserve >= item.price) {
          balance -= item.price; spent += item.price; st.spentItems += item.price; ownedIds.add(item.id); st.owned[item.kind]++;
          if (st.firstBuy[item.kind] === null) st.firstBuy[item.kind] = d + 1;
          if (st.owned[item.kind] === COUNT[item.kind] && st.allOf[item.kind] === null) st.allOf[item.kind] = d + 1;
        } else if (p.shop !== 'cheapest') break;
      }
      if (ownedIds.size === SHOP.length && st.allShop === null) st.allShop = d + 1;
    }
    if (CHECKPOINTS.includes(d + 1)) {
      const earned = earnedSoFar;
      st.snap[d + 1] = { earned, balance: Math.max(0, earned - spent), owned: { ...st.owned }, spentHints: st.spentHints, hustle: hustleNext - 1, ach: unlockedAchievements(solves, START).size };
    }
  }
  st.earned = earnedSoFar;
  return st;
}

const RUNS = Number(process.argv[2] ?? 8);
const med = (xs: (number | null)[]) => {
  const v = xs.map((x) => (x === null ? Infinity : x)).sort((a, b) => a - b);
  const m = v[Math.floor(v.length / 2)]!;
  return m === Infinity ? '-' : String(Math.round(m));
};
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`Shop: ${COUNT.theme} Themes = ${TOTAL.theme}, ${COUNT.nameplate} Nameplates = ${TOTAL.nameplate}, ${COUNT.badge} Badges = ${TOTAL.badge}, gesamt ${TOTAL.theme + TOTAL.nameplate + TOTAL.badge}`);
console.log(`Runs pro Persona: ${RUNS}, 365 Tage ab ${new Date(START).toISOString().slice(0, 10)}, TAKE ${TAKE}, STUCK ${process.env.STUCK ?? 0.25}, Hint ${HP}\n`);
for (const p of PERSONAS.filter((x) => !ONLY || ONLY.includes(x.name))) {
  const res = Array.from({ length: RUNS }, (_, i) => simulate(p, i + 1));
  const perDay = avg(res.map((r) => r.snap[30]!.earned / 30));
  const perDay365 = avg(res.map((r) => r.snap[365]!.earned / 365));
  const minPerPlayed = avg(res.map((r) => r.minutes / Math.max(1, r.playedDays)));
  const want = avg(res.map((r) => r.want)), free = avg(res.map((r) => r.free)), coins = avg(res.map((r) => r.coins)), video = avg(res.map((r) => r.video)), denied = avg(res.map((r) => r.denied)), unl = avg(res.map((r) => r.unlimited));
  const pct = (x: number) => (want ? `${Math.round((100 * x) / want)}%` : '-');
  console.log(`## ${p.name}: ${p.desc}`);
  console.log(`  Spielzeit ${minPerPlayed.toFixed(0)} min je Spieltag, ${avg(res.map((r) => r.playedDays)).toFixed(0)} Spieltage/Jahr; Coins/Tag: Monat 1 ${perDay.toFixed(0)}, Jahr ${perDay365.toFixed(0)}; Coins je Spielminute ${(avg(res.map((r) => r.earned)) / avg(res.map((r) => r.minutes))).toFixed(2)}`);
  console.log(`  Hints gewollt ${(want / 365).toFixed(2)}/Tag: frei ${pct(free)}, Coins ${pct(coins)}, Video ${pct(video)}, Kauf ${pct(unl)}, ohne ${pct(denied)}; Coins fuer Hints ${Math.round(avg(res.map((r) => r.spentHints)))} von ${Math.round(avg(res.map((r) => r.earned)))} (${Math.round((100 * avg(res.map((r) => r.spentHints))) / avg(res.map((r) => r.earned)))}%)`);
  for (const c of CHECKPOINTS) {
    const s = res.map((r) => r.snap[c]!);
    console.log(`  Tag ${String(c).padStart(3)}: verdient ${Math.round(avg(s.map((x) => x.earned))).toString().padStart(6)}, Stand ${Math.round(avg(s.map((x) => x.balance))).toString().padStart(5)}, Themes ${avg(s.map((x) => x.owned.theme!)).toFixed(1)}/${COUNT.theme}, Plates ${avg(s.map((x) => x.owned.nameplate!)).toFixed(1)}/${COUNT.nameplate}, Badges ${avg(s.map((x) => x.owned.badge!)).toFixed(1)}/${COUNT.badge}, Ach ${avg(s.map((x) => x.ach)).toFixed(0)}, Hustle ${Math.round(avg(s.map((x) => x.hustle)))}`);
  }
  console.log(`  Tag erster Kauf: Theme ${med(res.map((r) => r.firstBuy.theme!))}, Plate ${med(res.map((r) => r.firstBuy.nameplate!))}, Badge ${med(res.map((r) => r.firstBuy.badge!))}; alle Themes ${med(res.map((r) => r.allOf.theme!))}, alle Plates ${med(res.map((r) => r.allOf.nameplate!))}, alle Badges ${med(res.map((r) => r.allOf.badge!))}, ganzer Shop ${med(res.map((r) => r.allShop))}\n`);
}

# Puzzle Hustle
Web-first puzzle app (React 19, Vite, TypeScript, pnpm workspace), packaged with Capacitor for Android and iOS. Context and decisions: ~/hub/wiki/puzzle-hustle.md.

- Puzzle logic lives in `packages/core` and stays DOM-free. UI in `apps/web`. New puzzle types: add generator, checker and hint to core with tests first, then a game component under `apps/web/src/<type>/`.
- Daily/weekly/monthly seeds derive from the Europe/Berlin date (`schedule.ts`). Changing a generator changes every past and future scheduled puzzle; bump `*_VERSION` and keep the old path if links must survive.
- Theme tokens mirror vexury.dev (`apps/web/src/theme.css`). Light and dark must both work; check `[data-theme]`.
- Hints go through `HintProvider` (`apps/web/src/lib/hints.ts`). Web is free; native builds get AdMob rewarded ads and a one-time unlimited purchase later.
- Tests: `pnpm test`. Typecheck before committing: `pnpm typecheck`.
- Remotes: `origin` is the NAS bare repo, `github` is the public deploy repo. Push both.

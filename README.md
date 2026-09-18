# Puzzle Hustle

Daily, weekly and monthly logic puzzles. Web first, packaged for Android and iOS with Capacitor.

## Layout

- `packages/core`: puzzle logic, generators, hints, schedule (pure TypeScript, Vitest).
- `apps/web`: React 19 + Vite UI, PWA, Capacitor shell (`android/`, `ios/`).

## Commands

```
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # core tests
pnpm typecheck
pnpm build        # apps/web/dist
```

Native: `pnpm --filter @puzzle-hustle/web exec cap sync`, then open `apps/web/android` in Android Studio or `apps/web/ios/App` in Xcode.

## Deploy

Push to `main` on GitHub runs `.github/workflows/deploy.yml` and publishes `apps/web/dist` to GitHub Pages. The repository variable `VITE_BASE` sets the base path (`/puzzle-hustle/` for the project site, `/` once a custom domain is attached).

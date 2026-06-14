## What I found on a deep scan

1. **Map appears clipped under the top bar.** `GameMap` uses `absolute inset-0` and `TopBar` floats over it with `fixed top-0`. On tall mobile viewports (your replay shows 648×1843) the canvas renders correctly but the visible "map area" feels squeezed because there is no top padding hint and the recenter/zoom FAB sits flush at the bottom under the leaderboard pill. The map itself is fine — the _layout_ makes it look broken.
2. **Theme is inconsistent.** `store.ts` initializes `theme` from `matchMedia` but ignores a saved `ntc:theme`. `__root.tsx` applies system theme on mount and also ignores the saved value on first paint. Result: toggle works, but a refresh can flip the theme back.
3. **Achievements is a dead "Coming soon" row** in the menu — never built.
4. **Donate page** exists but isn't reachable from the public landing (only from the in-game menu) and has no SEO `head()`.
5. **Auth screen** — login path silently fabricates a username from the email; no feedback, no "forgot password" affordance, and the password strength bar shows 4 segments but tops out at 3 colors.
6. **Leaderboard** "show self when not ranked" branch builds a fake `rank: 99` row even when the user has zero zones — looks like a bug to players.
7. **GameMap** re-applies grid layers after a `setStyle` theme switch but uses a hardcoded `fill-opacity: 0.5` (loses the contested pulse interpolation) and doesn't re-add `grid-selected`.

## Plan

### A. Map layout fix (no business-logic change)

- `play.tsx`: wrap map in a dedicated `<main>` and add `padding-top: env(safe-area-inset-top)` plus a transparent 76px spacer concept via CSS variable so the floating top bar never visually covers active grid cells.
- `GameMap.tsx`: after init, call `map.resize()` on a `ResizeObserver` watching the container — fixes the "tiny canvas" snap we see in the rrweb replay when the viewport changes from 648→ same width but height re-layout.
- Restore full `fill-opacity` interpolation and re-add `grid-selected` layer inside the `reapply` theme handler.

### B. Theme consistency

- `store.ts`: read `localStorage.getItem("ntc:theme")` first, fall back to `matchMedia`.
- `__root.tsx`: on mount, prefer stored value; only follow system if unset. Update `<meta name="theme-color">` dynamically so the mobile address bar matches.

### C. Ship Achievements

- New `src/lib/game/achievements.ts`: 8 deterministic achievements (First Claim, Hold 10 Zones, Province Pioneer, Night Owl, Streak x3, Cross-Province Conqueror, Capital Capture, Leaderboard Top 10). Pure functions over `zones`/`leaderboard`/`user`.
- New `src/components/game/AchievementsSheet.tsx`: a right-side glass drawer (mirrors MenuSheet visual language) with progress bars, locked/unlocked states, faction-tinted highlights, and a `🎉` toast hook when one unlocks during `simulateTick`.
- `MenuSheet.tsx`: replace the "Coming soon" item with a real opener for the new sheet; show unlocked-count badge.
- `store.ts`: add `unlockedAchievements: Set<string>` persisted to `localStorage` and a `checkAchievements()` called at the end of `simulateTick` and `claimZone`.

### D. Auth polish

- Login path: real "Welcome back, {derived name}" toast via `sonner` before navigating.
- Strength meter: cap segments at 4, color-map 1=crimson, 2=amber, 3=volt, 4=cyan (matches faction palette).
- "Forgot password?" link → opens a small inline "mock auth — nothing stored" tooltip to set expectations.
- Add `aria-live="polite"` on inline errors.

### E. Donate page polish

- Add a `head()` with title/description/og.
- Add a back-to-play link in the header.
- Surface a small "Support" link in the landing page footer so it's reachable pre-signup.

### F. Leaderboard self-row fix

- Only show the sticky "you" row when `user` exists _and_ has ≥1 owned zone; otherwise show a subtle "Claim a zone to enter the ranks" hint.

### G. Performance & misc

- Add `loading="lazy"` / `decoding="async"` policy to any future imagery (no-op now, but documented).
- Add `prefers-reduced-motion` guard around the `gps-marker` ping animation in `styles.css`.
- Strip dead `useMapApi()` export from `GameMap.tsx`.

### Files touched

- edit `src/routes/play.tsx`
- edit `src/components/game/GameMap.tsx`
- edit `src/lib/game/store.ts`
- edit `src/routes/__root.tsx`
- edit `src/routes/index.tsx`
- edit `src/routes/donate.tsx`
- edit `src/components/game/MenuSheet.tsx`
- edit `src/components/game/Leaderboard.tsx`
- edit `src/styles.css`
- new `src/lib/game/achievements.ts`
- new `src/components/game/AchievementsSheet.tsx`

No new npm dependencies. No backend changes (still mock). `BACKEND.md` stays as the source of truth for the real-backend rollout.

# Moonlight Seva — release

How to build it, how to serve it, and what to check before handing over the link.

## Build and serve

```bash
npm install
npm run build          # typecheck + production bundle into dist/
npm run preview        # serve dist/ locally
```

The game is a static build: Vercel serves `dist/` (`vercel.json`), and Supabase is the whole
backend — Postgres for teams, rounds, results and both boards; Realtime for lobbies, presence and
ghosts. There is no game server to run.

### Configuration

| Variable | Where | What it is |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser build | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser build | Publishable key only — never the service-role/secret key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser build | Clerk publishable key |

Set the same three in Vercel → Project → Settings → Environment Variables, and make sure every
environment points at the **same** Supabase project (two projects means two separate sets of
teams). Team size (4) and the lobby rules live in the database (`teams.max_members`, the
functions in `supabase/migrations/`), not in the client.

### Supabase

1. Apply `supabase/migrations/` in filename order (Supabase CLI `supabase db push`, or the SQL
   editor). They are idempotent where possible and never delete historical results.
2. Clerk → [Connect with Supabase](https://dashboard.clerk.com/setup/supabase): activate, so session
   tokens carry `role: authenticated`.
3. Supabase → Authentication → Third-Party Auth → Add Clerk with the Clerk instance domain.
4. Check: sign in, create a team, and see the row in Table Editor → `teams`.

## Release checklist

**Build**

- [x] `npm run typecheck` clean
- [x] `npm run lint` clean
- [x] `npm test` — 306 passing, 2 skipped
- [x] `npm run build` succeeds; engine chunk lazy-loaded (3.37 MB, 1.23 MB gzipped), menu bundle
      92 kB gzipped
- [x] Production build verified in a browser: menu, loading screen, village, 60 fps, 131 MB heap,
      **no console output at all**, `__seva` absent from the bundle
- [x] No development console logs in the production build (config and clip warnings are behind
      `import.meta.env.DEV`; the engine-failed-to-start error is deliberate)
- [x] No debug UI: `window.__seva` is imported only under `import.meta.env.DEV`

**Assets**

- [x] No missing materials — every art module falls back to the greybox, and a missing texture set
      throws at load rather than rendering white
- [x] No placeholder character — `devotee.glb`, with clips made in code
- [x] No placeholder environment — the village's art pass covers ground, houses, interiors,
      temple, trees, shops, props, festival, villagers, dogs, items
- [x] Menu background is a real frame of the game (134 KB)
- [x] Audio is CC0 samples plus synthesis; nothing unlicensed

**Flow**

- [x] Loading screen (progress from the engine's own preload)
- [x] Main menu — name, Play solo, Create team, Join team, How to play, Puja list, Leaderboard,
      Settings
- [x] Tutorial — seven steps, each ending on something the player did
- [x] Village — collect, moonrise, shelter, continue
- [x] Temple — missing list, offering, closing puja
- [x] Results — stats, score, boards, Play again
- [x] Play again restarts cleanly (fresh engine, empty bag, moon back to safe)
- [x] Desktop controls; mobile controls (joystick verified against the production build on an
      emulated phone: the stick places itself under the thumb and deflects fully); portrait warning

**Multiplayer**

- [ ] Two players, two browsers, one team code, one village, one moon (over Supabase)
- [x] Ghost teammates with name tags, no collision
- [x] Scores recomputed in Postgres; impossible runs refused; duplicates refused (verified in SQL)
- [x] Individual and team boards, kept apart

**Still to do before the contest**

- [ ] Deploy to a public URL (Vercel) and put the link in the submission
- [ ] Play a full run on a real phone and a mid-range laptop. Open the game with **`?perf=1`** and
      read the overlay: frame rate, draw calls, triangles, the quality profile it chose, and heap.
      `npm run dev` prints a LAN address for exactly this.

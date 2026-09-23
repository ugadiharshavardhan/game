# Moonlight Seva — release

How to build it, how to serve it, and what to check before handing over the link.

## Build and serve

```bash
npm install
npm run build          # typecheck + production bundle into dist/
npm run server         # serves dist/ and the multiplayer socket on :8787
```

One process serves both the game and the sessions, so there is one URL and no CORS. Open
`http://localhost:8787`; the health check is `/healthz` and the socket is `/session`.

Without the server the game still plays: solo runs work, and teams fall back to the same-device
transport (tabs of one browser find each other), which is enough to demonstrate the whole flow.

### Configuration

Everything the contest might want to change is an environment variable on the server — nothing
about the rules is compiled into the client.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | 8787 | HTTP and WebSocket port |
| `MIN_PLAYERS` | 1 | Players needed before a lobby can start |
| `MAX_PLAYERS` | 4 | Team size |
| `REQUIRE_READY` | true | Everyone must press Ready |
| `LOBBY_TIMEOUT_MIN` | 30 | A lobby nobody starts is forgotten |
| `SYNC_HZ` | 10 | Position updates a second |
| `TEAM_SCORE_COUNT` | 0 (all) | How many members' scores make the team score |
| `DATA_FILE` | `server/data/boards.json` | File fallback when Supabase is not configured |
| `VITE_SUPABASE_URL` | — | Supabase project URL (also used by the client) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | — | Publishable/anon key; boards use Supabase when set |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Preferred on the session host for board writes (bypasses RLS) |

### Deploying it somewhere public

Everything needed is in the repository; pick whichever of these you have an account for.

**A container, anywhere** — `Dockerfile` builds the game and runs the server on `$PORT`:

```bash
docker build -t moonlight-seva .
docker run -p 8787:8787 -e MAX_PLAYERS=4 moonlight-seva
```

**Fly.io** — `fly.toml` is written (Mumbai region, a 1 GB volume for the boards, `/healthz`
checks):

```bash
fly launch --no-deploy     # once, to claim the app name
fly volumes create data --size 1
fly deploy
```

**Render** — `render.yaml` is a blueprint: New → Blueprint → point it at this repository. It
mounts a disk for the leaderboards and health-checks `/healthz`.

**GitHub Pages** — `.github/workflows/pages.yml` publishes the *static* game on every push to
main (Settings → Pages → Source: GitHub Actions, once). Pages cannot run the session server, so
that build is solo play, the tutorial, and teams across tabs of one device. To make the Pages
build talk to a deployed server, set the repository variable `SESSION_SERVER` to
`wss://your-server/session` — the workflow passes it to the build.

**By hand** — the server is one Node process with one dependency (`ws`) and a JSON file for
state. Upload `dist/`, `server/`, `src/` (the server reads the shared rules from source) and
`package.json`; run `node --experimental-strip-types server/index.ts` on Node 22.6+; put TLS in
front of it (the client picks `wss://` by itself on an `https://` page); point `DATA_FILE` at a
persistent disk.

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

- [x] Two players, two browsers, one village, one moon (verified over the real socket)
- [x] Ghost teammates with name tags, no collision
- [x] Scores recomputed on the server; impossible runs refused; duplicates refused
- [x] Individual and team boards, kept apart

**Still to do before the contest**

- [ ] Deploy to a public URL and put the link in the submission (`fly deploy`, Render blueprint,
      or the Pages workflow — all four routes are prepared above; this needs an account, which is
      the only reason it is not done)
- [ ] Play a full run on a real phone and a mid-range laptop. Open the game with **`?perf=1`** and
      read the overlay: frame rate, draw calls, triangles, the quality profile it chose, and heap.
      `npm run dev` prints a LAN address for exactly this.
- [ ] Decide `MAX_PLAYERS` and `MIN_PLAYERS` for the contest's rules

# Moonlight Seva

A browser game for the NIAT Ganesh Chaturthi Game Design Contest.

You are a young devotee preparing for Ganesh Puja. Gather the offerings the puja
asks for and carry them to the temple — but tonight the Chaturthi moon rises, and
one does not stand beneath it. The village warns you before it arrives: the sky
cools, lamps are lit in doorways, the birds go quiet. When the moonlight falls,
step inside a house and wait.

| Document | What's in it |
| --- | --- |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Gameplay loop, state machines, systems, data models, build order, risks, MVP scope |
| [docs/SYSTEMS.md](docs/SYSTEMS.md) | How the run works: puja items, interaction, the bag, safe houses, the moon cycle, exposure, the closing puja and the score |
| [docs/LEVEL_DESIGN.md](docs/LEVEL_DESIGN.md) | The village map, areas, shelter rules, puja item spots with measured distances |
| [docs/ART_BRIEF.md](docs/ART_BRIEF.md) | Visual direction, cultural guidance, the art toolkit, per-module specs |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Quality profiles, measured costs, the heaviest assets, the optimisation checklist |
| [docs/RELEASE.md](docs/RELEASE.md) | Build, serve, deploy, and the release checklist |

## Status

Third-person 3D (Three.js + Rapier), playable start to finish: gather the seven puja items
(flowers, durva, a coconut, bananas, rice, diyas, modaks) around the village — two bag-loads at
least — and offer them at the temple, sheltering indoors whenever the clouds part and the
Chaturthi moon shines. Ten houses can be walked into.

The evening runs on a five-state moon cycle (safe → warning → rising → active → fading) that
drives the lighting from sunset through dusk to a risen moon, the five synthesised ambience beds,
the villagers going home, the dogs settling, and *exposure* — which climbs while you are out under
the light and, if it fills, costs you three offerings and a lift indoors from the neighbours,
never the run. Finishing the puja plays a short cinematic at the temple and a results screen with
the score. See [docs/SYSTEMS.md](docs/SYSTEMS.md).

The devotee's animations are made in code for his skeleton (`src/game/player/proceduralClips.ts`).
Mixamo clips baked into the .glb by `tools/blender/` (below) take over automatically when present.

New players get a two-minute playable tutorial (from **How to play**): walk, collect a flower,
watch the bag fill, find a lit door, go in, watch a moonrise through the window, and come out
again. Every step ends on something the player did.

Controls: WASD / left stick move · mouse / right stick look · Shift run · Ctrl slow walk ·
C crouch · E (A) interact · I or Tab (Y) the bag · wheel / D-pad zoom · Esc / P pause.
On touch: a thumb joystick on the left, drag on the right to look, pinch zooms, and large
COLLECT / SNEAK / bag / pause buttons; keyboard hints are hidden and a portrait phone is asked,
once and quietly, to turn sideways.

## Playing together

A player types a name — no account, no password, no email — and gets an id that tells two Harshas
apart. From the menu they can **Create team** (which prints a code like `MOON-7K4P` to share) or
**Join team** with a friend's code. When the host starts, everyone walks into *the same village
with the same moon*, sees their teammates as translucent ghosts with name tags, and plays their
own puja: their own bag, their own exposure, their own shelter, their own score. Teams have their
own leaderboard, kept separate from the players' one.

Scores are recomputed on the server from the run's statistics before they reach a board, so a
modified client can change what it shows and not what is recorded.

```bash
npm run server     # the session server: teams, lobbies, ghosts, boards — and serves dist/
```

With no server running, teams fall back to the tabs of one browser, which is enough to see the
whole flow (and to test it). See [docs/RELEASE.md](docs/RELEASE.md) for deployment.

## Commands

```bash
npm run dev        # dev server, also exposed on the LAN for phone testing
npm test           # vitest: camera, level design, playthroughs, shelters, interaction, bag, moon,
                   #         lighting, audio, the puja sequence, and the multiplayer rules
npm run typecheck  # tsc -b, no emit
npm run lint       # oxlint
npm run build      # typecheck + production build
npm run server     # session server on :8787 (serves dist/ too)
npm run serve      # build, then serve
npm run preview    # serve the production build without the sessions
```

Deployment is prepared four ways — a `Dockerfile`, `fly.toml`, `render.yaml`, and a GitHub Pages
workflow for the static build. See [docs/RELEASE.md](docs/RELEASE.md).

Open any build with **`?perf=1`** for a small overlay showing frame rate, draw calls, triangles,
the quality profile and heap — that is how the game gets measured on a real phone.

URL options (dev and prod): `?view=greybox` shows the village exactly as it collides;
`?scene=testbed` is the character test ground; `?only=ground,houses,temple` builds only
those art modules (everything else greybox) for fast art iteration.

In development, `window.__seva` offers `teleport(x, z, yawDeg)`, `look(yawDeg, pitchDeg)`,
`walkTo(x, z, { run })` (an autopilot on the real controller), `moon(state)`, `give(item, n)`,
`interact()`, `enter(houseId)` / `leave()` and `info()` (position, area, safe, exposure, moon,
bag, camera stats, draw calls). It is not included in production builds.

## Camera

`src/game/camera/ThirdPersonCamera.ts` with every value in `CameraConfig.ts` — a
Cinemachine-style follow camera: damped follow (separate horizontal/vertical), light rotation
damping, mouse / right stick (with response curve and turn ramp) / touch drag, wheel / pinch /
D-pad zoom, FreeLook-style pitch-dependent distance, run pull-back with a subtle FOV push, sneak
closer and lower, optional recentering for controller and touch, R3 to snap behind.

Collision sweeps a sphere body → pivot → shoulder → camera, so the camera can't begin a sweep
inside a wall; it pulls in instantly and eases back out, and fades the player when very close.
Thin props and the invisible map edge don't pull it in (physics layers). Players can change
sensitivity and invert-Y in the pause menu.

## The village

`src/game/world/village/`: the layout is data (`layout.ts`); `solids.ts` turns it into colliders
and navigation; `render/greybox.ts` and `render/art/*` draw it. Level-design rules — reachability,
route choice, shelter distance, offering-spot tags — are tests, and `playthrough.test.ts` walks the
real controller over the real colliders with the camera checked every frame.

## Character pipeline (Blender 4.5 + MPFB 2)

```bash
blender -b -P tools/blender/build_devotee.py -- --project .     # build + export public/assets/models/devotee.glb
blender -b -P tools/blender/retarget_mixamo.py -- --project .   # bake art/mixamo/*.fbx clips into the .glb
```

Mixamo clips (Y Bot, *FBX Binary*, *Without Skin*, 30 fps) go in `art/mixamo/` named
`Idle, SlowWalk, Walk, Run, CrouchIdle, CrouchWalk, Interact, Pickup, Celebrate, EnterHouse, ExitHouse`.

## Layout

```
docs/                     design, level design, art brief, level map
tools/blender/            character build + Mixamo retarget scripts (the source of the .glb)
tools/level/              level map and distance report generators
public/assets/            runtime assets: models/, textures/ (CC0 ambientCG), audio/ (CC0 Kenney)
src/
├── App.tsx               app-level state machine: menu ⇄ playing ⇄ results
├── ui/                   ── REACT LAYER ── GameCanvas, Hud, MoonUI, InteractionPrompt,
│   ├── menu/             the menu: name, teams, lobby, boards, how to play, puja list, settings
│   └── …                 InventoryUI, TouchControls, TutorialCard, PauseOverlay, ResultsScreen
├── net/                  ── MULTIPLAYER ── Authority (the rules), transports (socket / same
│                         device), and one service per job: profile, team, lobby, session, sync,
│                         score, leaderboard
├── shared/               ── THE CONTRACT ── typed events, EventBus, the item catalogue
└── game/                 ── 3D ENGINE ── (lazy-loaded)
    ├── index.ts          create/destroy the engine; the only entry point
    ├── Gameplay.ts       the run: bag, moon, exposure, interaction, shelter, score, in frame order
    ├── core/             Engine (renderer, loop), Input, Physics (Rapier, layers), AudioBank,
    │                     quality (what this device may be asked for), devtools (dev only)
    ├── audio/            SoundFx — the synthesised one-shots; Ambience — the five looping beds
    ├── interaction/      IInteractable, InteractionSystem (+ tests)
    ├── inventory/        InventorySystem, InventoryItem (+ tests)
    ├── items/            PujaItem
    ├── shelter/          SafeHouse, HouseInterior, ShelterManager (+ walk-in tests)
    ├── moon/             MoonState, MoonManager, MoonLightingController, MoonAudioController,
    │                     ExposureSystem (+ tests)
    ├── run/              RunTracker — the run's statistics and its score
    ├── multiplayer/      GhostPlayers — teammates, translucent, animated, uncollidable
    ├── tutorial/         Tutorial — the two-minute guided walk
    ├── config/           playerConfig.ts — every tunable player number
    ├── camera/           ThirdPersonCamera (with interior shots), CameraConfig, cameraMath (+ tests)
    ├── player/           Player, PlayerController, PlayerState, PlayerAnimation, proceduralClips,
    │                     PlayerAudio, locomotion (pure maths + tests)
    └── world/
        ├── environment.ts the sky rig: sky dome, the one shadow light, fog, stars, moon, mist
        ├── Testbed.ts    the character test ground (?scene=testbed)
        └── village/      layout, solids, navgrid, colliders, triggers, interactables (+ level tests)
            ├── PujaSequence.ts the closing cinematic's camera, beats and bells
            └── render/   greybox.ts, art/ (ground, houses + interiors, temple, trees, shops,
                          props, festival, puja items, villagers, walkers, dogs, petals)
```

## The three rules

Everything in this repo follows from these. Breaking one is how React + engine
projects turn into mud.

1. **React never holds a Three.js object**, and the engine never touches the DOM
   outside its canvas.
2. **All traffic between the layers goes through `shared/events.ts`.** If it
   isn't in that map, it doesn't cross.
3. **`src/shared/` must not import the engine.** That constraint is what lets the
   entire engine load lazily, so the menu paints before Three.js and Rapier are downloaded.

## Testing on a phone

`npm run dev` prints a Network URL. Open it on a phone on the same Wi-Fi: touch the left half of
the screen to move, drag the right half to look, pinch to zoom.

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
| [docs/LEVEL_DESIGN.md](docs/LEVEL_DESIGN.md) | The village map, areas, shelter rules, offering spots with measured distances |
| [docs/ART_BRIEF.md](docs/ART_BRIEF.md) | Visual direction, cultural guidance, the art toolkit, per-module specs |

## Status

Third-person 3D (Three.js + Rapier). The whole village is playable from home to the temple:
walk, run, slow walk, crouch; shelter in houses; offer prayers at the temple. The moon cycle,
offerings inventory and scoring come next.

Animations come from Mixamo and are baked into the character by Blender — see
`tools/blender/` below. Until they are added the devotee (and the villagers) hold his bind pose.

## Commands

```bash
npm run dev        # dev server, also exposed on the LAN for phone testing
npm test           # vitest: camera, level design, physics playthroughs, movement
npm run typecheck  # tsc -b, no emit
npm run lint       # oxlint
npm run build      # typecheck + production build
npm run preview    # serve the production build
```

URL options (dev and prod): `?view=greybox` shows the village exactly as it collides;
`?scene=testbed` is the character test ground; `?only=ground,houses,temple` builds only
those art modules (everything else greybox) for fast art iteration.

In development, `window.__seva` offers `teleport(x, z, yawDeg)`, `look(yawDeg, pitchDeg)`,
`walkTo(x, z, { run })` (an autopilot on the real controller) and `info()` (position, area,
camera stats, draw calls). It is not included in production builds.

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
├── App.tsx               app-level state machine: menu ⇄ playing ⇄ paused
├── ui/                   ── REACT LAYER ── MainMenu, GameCanvas, Hud, PauseOverlay
├── shared/               ── THE CONTRACT ── typed events + EventBus (never imports the engine)
└── game/                 ── 3D ENGINE ── (lazy-loaded)
    ├── index.ts          create/destroy the engine; the only entry point
    ├── core/             Engine (renderer, loop), Input, Physics (Rapier, layers), devtools (dev only)
    ├── config/           playerConfig.ts — every tunable player number
    ├── camera/           ThirdPersonCamera, CameraConfig, cameraMath (+ tests)
    ├── player/           Player, PlayerController, PlayerState, PlayerAnimation,
    │                     PlayerInteraction, PlayerAudio, locomotion (pure maths + tests)
    └── world/
        ├── environment.ts evening sky, sun, fog, image-based light
        ├── Testbed.ts    the character test ground (?scene=testbed)
        └── village/      layout, solids, navgrid, colliders, triggers, doors (+ level tests)
            └── render/   greybox.ts, art/ (ground, houses, temple, trees, shops, props,
                          festival, villagers)
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

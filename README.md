# Moonlight Seva

A browser game for the NIAT Ganesh Chaturthi Game Design Contest.

You are a young devotee preparing for Ganesh Puja. Gather the offerings the puja
asks for and carry them to the temple — but tonight the Chaturthi moon rises, and
one does not stand beneath it. The village warns you before it arrives: the sky
cools, lamps are lit in doorways, the birds go quiet. When the moonlight falls,
step inside a house and wait.

**The full design is in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)** — gameplay
loop, state machines, systems, data models, phased build order, risks and MVP
scope. Read that before adding anything.

## Status

Third-person 3D (Three.js + Rapier). You can start the game and walk the devotee around an
evening test ground: walk, run, slow walk, crouch, over-the-shoulder camera, interactions
(coconut pickup, shrine, house door → hidden). The moon, offerings and scoring come next.

Animations come from Mixamo and are baked into the character by Blender — see
`tools/blender/` below. Until they are added the devotee moves in his bind pose.

## Commands

```bash
npm run dev        # dev server, also exposed on the LAN for phone testing
npm test           # vitest: movement maths, player state, interaction
npm run typecheck  # tsc -b, no emit
npm run lint       # oxlint
npm run build      # typecheck + production build
npm run preview    # serve the production build
```

## Character pipeline (Blender 4.5 + MPFB 2)

```bash
blender -b -P tools/blender/build_devotee.py -- --project .     # build + export public/assets/models/devotee.glb
blender -b -P tools/blender/retarget_mixamo.py -- --project .   # bake art/mixamo/*.fbx clips into the .glb
```

Mixamo clips (Y Bot, *FBX Binary*, *Without Skin*, 30 fps) go in `art/mixamo/` named
`Idle, SlowWalk, Walk, Run, CrouchIdle, CrouchWalk, Interact, Pickup, Celebrate, EnterHouse, ExitHouse`.

## Layout

```
docs/                     design documentation
tools/blender/            character build + Mixamo retarget scripts (the source of the .glb)
public/assets/            runtime assets: models/, textures/ (CC0 ambientCG), audio/ (CC0 Kenney)
src/
├── App.tsx               app-level state machine: menu ⇄ playing ⇄ paused
├── ui/                   ── REACT LAYER ── MainMenu, GameCanvas, Hud, PauseOverlay
├── shared/               ── THE CONTRACT ── typed events + EventBus (never imports the engine)
└── game/                 ── 3D ENGINE ── (lazy-loaded)
    ├── index.ts          create/destroy the engine; the only entry point
    ├── core/             Engine (renderer, loop), Input, Physics (Rapier), AudioBank
    ├── config/           playerConfig.ts — every tunable player number
    ├── player/           Player, PlayerController, PlayerState, PlayerAnimation,
    │                     PlayerInteraction, PlayerAudio, locomotion (pure maths + tests)
    ├── camera/           ThirdPersonCamera
    └── world/            Testbed scene + test interactables
```

## The three rules

Everything in this repo follows from these. Breaking one is how React + engine
projects turn into mud.

1. **React never holds a Three.js object**, and the engine never touches the DOM
   outside its canvas.
2. **All traffic between the layers goes through `shared/events.ts`.** If it
   isn't in that map, it doesn't cross.
3. **`src/shared/` must not import the engine.** That constraint is what lets the
   entire engine load lazily, so the menu paints before Phaser is downloaded.

## Testing on a phone

`npm run dev` prints a Network URL. Open it on a phone on the same Wi-Fi. This
matters more than usual here: the camera framing guarantees a minimum visible
world area rather than a fixed aspect ratio, and that is only really verifiable
on a tall screen.

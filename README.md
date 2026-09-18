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

Phase 0 of 10: scaffold. You can start the game, walk a placeholder village on
desktop or mobile, and pause. The moon, shelters, offerings and scoring are the
work of phases 2–8.

## Commands

```bash
npm run dev        # dev server, also exposed on the LAN for phone testing
npm run typecheck  # tsc -b, no emit
npm run lint       # oxlint
npm run build      # typecheck + production build
npm run preview    # serve the production build
```

## Layout

```
docs/                     design documentation
public/assets/            runtime game assets, loaded by URL (see its README)
src/
├── App.tsx               app-level state machine: menu ⇄ playing ⇄ paused
├── main.tsx              React entry
├── index.css             Tailwind theme and base styles
│
├── ui/                   ── REACT LAYER ──
│   ├── components/       MainMenu, PhaserGame, PauseOverlay
│   └── hooks/            useGameEvent
│
├── shared/               ── THE CONTRACT ── (never imports Phaser)
│   ├── events.ts         the typed event map; nothing else crosses the boundary
│   ├── EventBus.ts       tiny typed emitter
│   └── types.ts          domain types used by both layers
│
├── game/                 ── PHASER LAYER ── (lazy-loaded)
│   ├── index.ts          create/destroy the engine; the only entry point
│   ├── config/           gameConfig.ts, constants.ts (all tunable numbers)
│   ├── scenes/           Boot → Preload → Village
│   ├── systems/          rules (InputSystem today; see design doc §4)
│   ├── entities/         bodies (Player)
│   └── graphics/         runtime-generated placeholder textures
│
└── utils/                pure helpers (viewport maths)
```

## The three rules

Everything in this repo follows from these. Breaking one is how React + Phaser
projects turn into mud.

1. **React never holds a Phaser object**, and Phaser never touches the DOM
   outside its canvas.
2. **All traffic between the layers goes through `shared/events.ts`.** If it
   isn't in that map, it doesn't cross.
3. **`src/shared/` must not import Phaser.** That constraint is what lets the
   entire engine load lazily, so the menu paints before Phaser is downloaded.

## Testing on a phone

`npm run dev` prints a Network URL. Open it on a phone on the same Wi-Fi. This
matters more than usual here: the camera framing guarantees a minimum visible
world area rather than a fixed aspect ratio, and that is only really verifiable
on a tall screen.

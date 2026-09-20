# Moonlight Seva — Game Design & Technical Architecture

> NIAT Ganesh Chaturthi Game Design Contest
> Status: design locked for MVP; the core loop is implemented (see [SYSTEMS.md](SYSTEMS.md)).
> The build moved from 2D Phaser to third-person 3D on Three.js + Rapier; the systems below map
> onto `src/game/` as SYSTEMS.md describes. Offerings are now seven puja items with quantities.
>
> Two things below were renamed on the way in, and **SYSTEMS.md is the accurate account** of what
> the game does: the five phases are now `safe · warning · rising · active · fading`
> (`MoonState.ts`), and *Purity draining to zero* became **Exposure climbing to 100**
> (`ExposureSystem.ts`) — the same idea the other way up, with a smaller cost when it fills:
> three offerings dropped and a lift indoors from the neighbours, rather than a walk back to the
> temple to be cleansed.

---

## 0. One-paragraph pitch

You are a young devotee preparing for Ganesh Puja. Walk the village, gather the offerings the
puja requires, and carry them to the temple. But tonight the moon rises — and by custom, one does
not stand under the Chaturthi moon. The village tells you the moon is coming before it arrives:
the sky cools, lamps are lit in doorways, birds go quiet, your shadow stretches. When moonlight
falls, step inside a house and wait. When it passes, go on. The game is a route-planning puzzle
under a clock you read from the world, not from a number.

---

## 1. Complete game architecture

### 1.1 Two-layer split

```
┌──────────────────────────────────────────────────────────────┐
│  REACT LAYER  (DOM, Tailwind)                                │
│  Menus · HUD chrome · Pause · Results · Leaderboard · Forms   │
│  Owns: app-level state machine, routing, persistence UI       │
└───────────────────────────┬──────────────────────────────────┘
                            │  EventBus (typed, bidirectional)
┌───────────────────────────┴──────────────────────────────────┐
│  PHASER LAYER  (Canvas/WebGL)                                │
│  World · Player · Items · Houses · Temple · Camera · Systems  │
│  Owns: simulation truth, the run, physics, the moon clock     │
└──────────────────────────────────────────────────────────────┘
```

**Hard boundary rules** (these prevent the classic React+Phaser mess):

1. React never holds a reference to a Phaser `GameObject`, `Scene`, or `Sprite`.
2. Phaser never touches the DOM outside its own canvas.
3. All crossing traffic goes through one typed `EventBus`. Nothing else.
4. The Phaser layer is the authority on run state. React renders a *projection* of it.
5. React owns exactly one Phaser `Game` instance, created on Play and destroyed on quit.

**Why the HUD lives in React, not Phaser:** responsive text, safe-area insets, accessibility,
and touch targets are solved problems in the DOM and painful in canvas. The offering list,
purity meter, phase indicator and pause menu are all DOM. Only *world-space* affordances
(interaction prompt above an item, house door highlight) are drawn in Phaser.

### 1.2 Communication contract

```
Phaser → React    run:started, run:tick, moon:phase-changed, inventory:changed,
                  offering:accepted, purity:changed, shelter:entered, shelter:exited,
                  run:completed, run:failed-cleanse, prompt:shown, prompt:hidden

React → Phaser    game:pause, game:resume, game:quit, game:restart,
                  input:virtual-move, input:action
```

All payloads are plain serializable objects. That keeps the boundary honest and makes the
leaderboard payload fall out for free.

### 1.3 Determinism

Every run is seeded. `seed → SpawnSystem (item/house layout) → MoonCycleSystem (phase jitter)`.
A seed reproduces a run exactly. This buys us: reproducible bug reports, a "daily seed" mode
later at zero cost, and server-side score sanity checks against a replay of inputs if the
leaderboard ever needs anti-cheat.

---

## 2. Core gameplay loop

### 2.1 Moment-to-moment loop (the ~40-second cycle the player actually feels)

```
  ┌─► 1. READ THE SKY      What phase are we in? How long do I have?
  │                         (from environment, never from a countdown number)
  │      2. PICK A TARGET   Which offering next? Which house covers me if I'm wrong?
  │      3. ROUTE           Item location × nearest shelter × inventory space
  │      4. COLLECT         Walk, interact, inventory fills
  │      5. THE DECISION    Clues escalate. Bank it and shelter, or grab one more?
  │      6. MOONLIGHT       Sheltered → safe, and the house reveals a clue/refills lamp.
  │                         Exposed → purity drains. Not death. Pressure.
  └──── 7. MOONSET          Doors open, world resumes, go again
```

Step 5 is the whole game. Everything else exists to make step 5 a real decision.

### 2.2 Session loop (~5–8 minutes)

```
Briefing (the puja's offering manifest, shown once)
   → 2–4 moon cycles of collection
   → all required offerings held
   → travel to temple
   → puja sequence (place each offering in order)
   → Results screen: score breakdown
   → Leaderboard submit
```

### 2.3 Failure design — why there is no death

**The moon does not kill.** Standing in moonlight drains a resource called **Purity**.

| State | Effect |
| --- | --- |
| Purity > 0, exposed | Drains at a steady rate. Screen desaturates, audio thins. Clear, readable feedback. |
| Purity hits 0 | You do not lose. You *drop your carried offerings where you stand* and must walk to the temple for a short cleansing (a few seconds, plus a score penalty). |
| After cleansing | Purity restored, run continues. Your dropped offerings are still on the ground where you left them. |

This is the design principle "tension, not unfair failure" made mechanical:

- The punishment is **time and score**, the two things the player is optimizing — so it stings.
- The punishment is **recoverable**, so a player never feels the run was stolen from them.
- The punishment is **thematically right**: in the story you are not injured, you are *un-ready*
  to carry offerings, and the remedy is a cleansing at the temple. Nothing dies. Nothing is
  destroyed. This matters for design principle #4.

There is a soft time limit (puja must be done before dawn, ~N moon cycles). Running out of
time ends the run with whatever you delivered — a low score, not a failure screen.

### 2.4 Why this isn't a generic collection game

The items are not the challenge — the **schedule** is. An offering across the village with no
house near it is worth more than one next to a shelter, because taking it means spending a full
moonlight phase committed. Inventory capacity forces trips. The moon forces trips to be timed.
The optimization surface is *route under a periodic hazard*, which is a genuinely different
puzzle from "walk over N pickups".

---

## 3. Game states

### 3.1 App-level FSM — owned by React

```
BOOT ──► MENU ──► BRIEFING ──► PLAYING ⇄ PAUSED
           ▲                      │
           │                      ▼
           └──── RESULTS ◄────────┘
                    │
                    ▼
              LEADERBOARD
```

| State | Phaser instance | Notes |
| --- | --- | --- |
| `BOOT` | none | App shell mounting |
| `MENU` | none | Pure React/Tailwind. Phaser not yet created. |
| `BRIEFING` | none | Shows this run's offering manifest |
| `PLAYING` | created, running | Canvas visible, HUD overlaid |
| `PAUSED` | created, scene paused | Overlay; physics + moon clock frozen |
| `RESULTS` | destroyed | Score breakdown from `run:completed` payload |
| `LEADERBOARD` | none | Backend phase |

### 3.2 Moon cycle FSM — owned by `MoonCycleSystem` in Phaser

```
DAY ──► DUSK ──► MOONRISE ──► MOONLIGHT ──► MOONSET ──► DAY ──► ...
(safe)  (warn)   (grace)      (danger)      (recover)
```

| Phase | Duration (MVP) | What the player can do | What the world does |
| --- | --- | --- | --- |
| `DAY` | 45s | Free exploration, collect | Warm light, ambient village sound |
| `DUSK` | 20s | Last safe collection window | Sky cools toward blue, shadows lengthen, birds quiet, house lamps light one by one |
| `MOONRISE` | 5s | **Grace period** — run for a door | Bell tolls, screen edge vignettes, unmistakable |
| `MOONLIGHT` | 25s | Shelter or drain | Blue-white wash, desaturation outside, doors shut behind you |
| `MOONSET` | 5s | Doors reopen | Light warms back, ambience returns |

Total cycle ≈ 100s. Durations carry ±10% seeded jitter so the player learns to *read* rather
than *count*. `MOONRISE` grace is the anti-unfairness valve: from the moment danger is certain,
you always have 5 seconds and (by spawn constraint) a door within reach.

### 3.3 Player FSM

```
IDLE ⇄ MOVING ──► INTERACTING ──► (back to IDLE)
  │
  ├──► SHELTERED  (inside a house, immune, can't move in world)
  ├──► EXPOSED    (in moonlight, purity draining)
  └──► CLEANSING  (at temple after purity hit 0)
```

---

## 4. Required systems

Ordered by dependency. Each is a plain TypeScript class, constructed with the scene, with an
`update(delta)` where relevant. None of them are Phaser plugins — plain objects keep them testable.

| # | System | Responsibility | Depends on |
| --- | --- | --- | --- |
| 1 | `EventBus` | Typed emitter, the only React↔Phaser channel | — |
| 2 | `RNG` | Seeded deterministic random | — |
| 3 | `MoonCycleSystem` | The clock. Owns phase + `progress` 0–1. Emits phase changes. | RNG, EventBus |
| 4 | `ClueSystem` | Turns `moonProgress` into diegetic signals: sky tint lerp, shadow length, lamp lighting, bird/ambience fade, bell. **Contains no gameplay logic** — purely the readable surface of system 3. | MoonCycleSystem |
| 5 | `InputSystem` | One abstraction over keyboard (WASD/arrows), virtual joystick (touch drag), and the action verb (Space / tap). | — |
| 6 | `SpawnSystem` | Seeded placement of houses, items, temple. Enforces the *reachability invariant* (see §8). | RNG |
| 7 | `InteractionSystem` | Proximity detection, prompt show/hide, single action verb dispatch | InputSystem |
| 8 | `InventorySystem` | Capacity, add/drop, what's carried | EventBus |
| 9 | `ShelterSystem` | House zones, enter/exit, occupancy, safe flag | MoonCycleSystem |
| 10 | `PuritySystem` | Exposure drain, cleansing, drop-on-zero | MoonCycleSystem, ShelterSystem, InventorySystem |
| 11 | `OfferingSystem` | The run's manifest, temple validation, puja sequence | InventorySystem |
| 12 | `ScoringSystem` | Run stats → score breakdown | all of the above |
| 13 | `AudioSystem` | Ambience layers, one-shots, iOS unlock-on-first-gesture | — |
| 14 | `SaveSystem` | `localStorage`: best score, seen-tutorial flag, audio prefs | — |
| 15 | `LeaderboardClient` | HTTP to Express backend (post-MVP) | — |

**Deliberately not systems:** no ECS, no state-management library, no physics beyond Arcade,
no tilemap editor pipeline until the art exists. Each of those is a real cost with no MVP payoff.

---

## 5. Scene structure

Three Phaser scenes. Resisting more scenes is a design decision, not laziness:

```
BootScene      → config, scale rules, generate primitive textures, hand off
PreloadScene   → load assets, report progress to React, build the atlas
VillageScene   → the entire run: world, player, items, houses, temple, all systems
```

**Why the temple is not its own scene.** A scene transition means serializing run state across
the boundary and rebuilding it — pure cost, no benefit. The temple is a *zone* in `VillageScene`
with its own interaction handler. Same for house interiors: entering a house is a state change
(camera dims, player hidden, shelter overlay) not a scene load. This keeps one authority for
run state and eliminates an entire class of transition bugs.

**Why no Phaser `UIScene`.** The HUD is React (see §1.1). The only canvas-space UI is the
interaction prompt, which belongs in `VillageScene` because it's world-positioned.

### Scene lifecycle
```
BootScene.create()     → scale config, EventBus wiring → scene.start('Preload')
PreloadScene.preload() → load queue, emit 'preload:progress'
PreloadScene.create()  → scene.start('Village')
VillageScene.create()  → build world from seed, construct systems, emit 'run:started'
VillageScene.update()  → InputSystem → MoonCycleSystem → ClueSystem → PuritySystem → …
```

---

## 6. Data models

```ts
// ---- Identity ----
type ItemId   = 'modak' | 'durva' | 'hibiscus' | 'coconut' | 'diya' | 'kumkum' | 'banana-leaf';
type HouseId  = string;
type Seed     = number;

// ---- Static definitions (authored, not generated) ----
interface ItemDef {
  id: ItemId;
  displayName: string;      // "Durva Grass"
  description: string;      // one respectful line, shown in briefing
  texture: string;
  weight: number;           // inventory slots consumed
  baseValue: number;        // score contribution
}

// ---- Runtime instances (spawned per run) ----
interface ItemInstance {
  uid: string;
  defId: ItemId;
  position: Vec2;
  state: 'world' | 'carried' | 'offered' | 'dropped';
}

interface HouseInstance {
  id: HouseId;
  position: Vec2;
  doorPosition: Vec2;
  shelterRadius: number;
  lampLit: boolean;         // ClueSystem lights these during DUSK
}

// ---- The puja ----
interface OfferingManifest {
  required: { defId: ItemId; count: number }[];
  order: ItemId[];          // the sequence the puja is performed in
}

// ---- The clock ----
interface MoonCycleConfig {
  phaseDurationsMs: Record<MoonPhase, number>;
  jitterFactor: number;     // 0.1 = ±10%
  totalCycles: number;      // soft time limit for the run
}
type MoonPhase = 'day' | 'dusk' | 'moonrise' | 'moonlight' | 'moonset';

interface MoonState {
  phase: MoonPhase;
  phaseProgress: number;    // 0..1 within the current phase
  cycleIndex: number;
  isDangerous: boolean;     // derived: phase === 'moonlight'
}

// ---- The run ----
interface RunState {
  seed: Seed;
  elapsedMs: number;
  moon: MoonState;
  purity: number;           // 0..100
  inventory: ItemInstance[];
  inventoryCapacity: number;
  offered: ItemId[];
  playerState: PlayerState;
  stats: RunStats;
}

interface RunStats {
  itemsCollected: number;
  cleansings: number;       // times purity hit zero
  msExposed: number;        // total time in moonlight unsheltered
  closeCalls: number;       // sheltered during MOONRISE grace, not before
  distanceTravelled: number;
}

// ---- The result ----
interface ScoreBreakdown {
  offeringPoints: number;   // sum of baseValue for delivered offerings
  timeBonus: number;        // faster puja → more
  purityBonus: number;      // ending purity
  riskBonus: number;        // closeCalls, rewarded — this is the skill expression
  cleansingPenalty: number; // negative
  total: number;
}

interface RunResult {
  seed: Seed;
  completed: boolean;
  durationMs: number;
  breakdown: ScoreBreakdown;
  stats: RunStats;
}

// ---- Backend (post-MVP) ----
interface LeaderboardEntry {
  _id?: string;
  playerName: string;       // sanitized, max 20 chars
  score: number;
  seed: Seed;
  durationMs: number;
  createdAt: string;        // ISO
}
```

`riskBonus` is worth calling out: rewarding the player for sheltering *late* rather than early
is what stops the optimal strategy from being "hide in a house all night".

---

## 7. Development order

Each phase ends in something playable. No phase is longer than a sitting.

| Phase | Deliverable | Done when |
| --- | --- | --- |
| **0 — Scaffold** ✅ | Vite + React + TS + Phaser + Tailwind, Boot/Preload/Village, menu, pause, responsive | Play button enters a scene with a movable player |
| **1 — Movement & world** | Seeded village layout, camera follow, collision, desktop + touch input | You can walk the whole village on a phone |
| **2 — The clock** | `MoonCycleSystem` with a **debug numeric readout** | Phases cycle and log correctly |
| **3 — The clues** | `ClueSystem`: sky tint, lamps, ambience, bell. Then **delete the debug readout.** | A playtester predicts moonrise without being told |
| **4 — Shelter** | Houses enterable, shelter state, doors | Moonlight is survivable |
| **5 — Consequence** | `PuritySystem`, drain, drop, cleansing | Being caught out matters but never ends the run |
| **6 — Items & inventory** | Spawning, pickup, capacity, drop | Route planning becomes real |
| **7 — The temple** | `OfferingSystem`, validation, puja sequence, run completion | A run can be *won* |
| **8 — Score & results** | `ScoringSystem`, results screen, localStorage best | A run produces a number you want to beat |
| **9 — Polish** | Art pass, audio pass, tutorial beat, mobile QA | Ship-quality |
| **10 — Leaderboard** | Express + MongoDB, submit + view | Scores persist across players |

**Phase 3 is the contest.** If a playtester can't feel moonrise coming from the world alone,
nothing else in this document matters. Budget the most time there.

---

## 8. Technical risks

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| 1 | **React 19 StrictMode double-mounts the Phaser game**, leaving a zombie instance and a duplicated canvas | High — happens immediately | The wrapper's effect must `game.destroy(true)` on cleanup and guard re-entry with a ref. Handled in the scaffold. |
| 2 | **HMR leaks Phaser instances** during development — canvases stack, WebGL contexts exhaust | High — appears within an hour of work | Same destroy path + `import.meta.hot.dispose`. Contexts are capped at ~16 in Chrome; leaking is fatal to the dev loop. |
| 3 | **Portrait vs landscape framing.** A layout tuned for 16:9 desktop shows a keyhole on a 9:19.5 phone, and the "is a house near me?" read — the core decision — breaks. | High | `Scale.RESIZE` + a camera zoom computed from a guaranteed **minimum visible world area**, not a fixed design resolution. Never letterbox. Verified in the scaffold. |
| 4 | **The clue channel fails.** Players don't read the sky and experience moonrise as random. | High — this is the whole design | Redundant channels (colour + audio + lamps + bell + shadow). The 5s `MOONRISE` grace period makes even a total misread survivable. Playtest phase 3 with fresh eyes. |
| 5 | **Difficulty tuning of the cycle** — 100s cycles may be tedious or frantic; can't know without play | Medium | All durations in one `balance.ts`. Expose a dev-only tuning overlay. Tune with real testers, not intuition. |
| 6 | **iOS audio autoplay policy** silently kills the ambience clue channel | Medium | Unlock `AudioContext` on the first user gesture (the Play button). Never rely on audio as a *sole* clue. |
| 7 | **React overlay eats touch input** meant for the canvas | Medium | HUD containers get `pointer-events: none`; only actual buttons re-enable it. Easy to get wrong, easy to test. |
| 8 | **Spawn layouts that are unwinnable** — an item with no house in reach during a cycle | Medium | `SpawnSystem` enforces a hard invariant: every item is within `playerSpeed × (DUSK + MOONRISE duration)` of a door. Assert it at spawn time and reroll the seed if violated. |
| 9 | **Mobile performance** — particles + lighting + DPR on a mid-range Android | Medium | Cap `devicePixelRatio` at 2. Prefer tint/overlay over Phaser Lights pipeline. Budget: 60fps on a 3-year-old phone. |
| 10 | **Cultural respect.** Offerings are real ritual objects; mishandling them in a mechanic reads badly. | High — contest-relevant | Offerings are never destroyed, thrown, or scored as "combo". Dropped items rest on the ground and are recoverable. Correct names in the briefing. The moon is a natural event, not a monster — no face, no chase, no jump scare. |
| 11 | Phaser bundle size (~1.2MB min) hurts first load on mobile data | Low | Code-split the Phaser chunk; it loads on Play, not on menu. The menu is pure React. |

---

## 9. Recommended MVP scope

### In scope

- One hand-authored village map, ~2× the viewport, with 6–8 houses and one temple.
- **5 offering types**, 6–8 items spawned per run from a seeded layout.
- Inventory capacity of **3**, forcing at least two temple trips.
- Full moon cycle with all 5 phases and the clue channels: **sky tint, house lamps, ambience
  fade, moonrise bell**.
- Shelter: enter/exit houses, immune while inside.
- Purity drain, drop-on-zero, temple cleansing.
- Temple offering sequence and a win condition.
- Score breakdown + results screen + `localStorage` best score.
- Desktop keyboard and mobile touch, both properly framed.
- Pause.

### Out of scope for MVP (and why)

| Cut | Why |
| --- | --- |
| Leaderboard backend | Phase 10. The game must be worth a score before scores are worth storing. |
| Multiple villages / levels | One map tuned well beats three untuned. Replayability comes from the seed. |
| NPCs, dialogue, story cutscenes | The briefing screen carries all necessary narrative. |
| Day/night *art* variants (separate tilesets) | A tint pass over one tileset reads just as well at a fraction of the cost. |
| Upgrades, currency, unlocks | Turns a tight puzzle into a grind. Directly against principle #6. |
| Animated character sprites beyond a 4-direction walk | Art budget goes to the sky and the lamps — the clue channel — not the player. |
| Tutorial level | The first `DAY` phase *is* the tutorial: 45 uninterrupted seconds to learn to walk and pick up. |

### The MVP's success test

> Hand the game to someone who has never seen it. Without telling them anything about the moon,
> do they shelter in time on their *second* cycle?

If yes, the design works. If no, phase 3 isn't finished.

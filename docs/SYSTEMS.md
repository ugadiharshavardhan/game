# Moonlight Seva — gameplay systems

How the run works in code: the puja items, the interaction system, the bag, safe houses, the
moon cycle and everything it drives — light, sound, the villagers, the dogs, exposure, the
closing puja and the score. Everything here is TypeScript on Three.js and Rapier (the project's
stack); the brief's Unity names map one-to-one onto files:

| Brief (Unity) | Here | What it is |
| --- | --- | --- |
| `PujaItem.cs` | `src/game/items/PujaItem.ts` | A collectible in the world |
| `IInteractable` | `src/game/interaction/IInteractable.ts` | Anything the action button can use |
| `InteractionSystem` | `src/game/interaction/InteractionSystem.ts` | Detection, priority, prompt, animation and sound |
| `InteractionPrompt` | `src/ui/components/InteractionPrompt.tsx` | The world-space prompt (React) |
| `InventorySystem.cs` | `src/game/inventory/InventorySystem.ts` | The bag |
| `InventoryItem.cs` | `src/game/inventory/InventoryItem.ts` | One stack in the bag |
| `InventoryUI.cs` | `src/ui/components/InventoryUI.tsx` | The bag's screen (React) |
| `SafeHouse.cs` | `src/game/shelter/SafeHouse.ts` | One enterable house: door, prompts |
| `HouseInterior.cs` | `src/game/shelter/HouseInterior.ts` | Its front room, in world space |
| `ShelterManager.cs` | `src/game/shelter/ShelterManager.ts` | Who is inside; the walk through the door |
| `MoonState.cs` | `src/game/moon/MoonState.ts` | The five states, their lengths, and the curves everything follows |
| `MoonManager.cs` | `src/game/moon/MoonManager.ts` | The cycle itself |
| `MoonLightingController.cs` | `src/game/moon/MoonLightingController.ts` | Sunset → dusk → moonrise → moonlight |
| `MoonAudioController.cs` | `src/game/moon/MoonAudioController.ts` | The five ambience beds, mixed against the sky |
| `MoonUI.cs` | `src/ui/components/MoonUI.tsx` | The moon indicator and its exposure ring (React) |

`src/game/Gameplay.ts` owns the run (bag, moon, exposure, interaction, shelter, score) and updates them
in order each frame; `Engine.ts` owns rendering and the loop. React only ever sees plain events
(`src/shared/events.ts`).

## The loop

The puja needs 25 things (`src/shared/items.ts`): 5 flowers, 3 durva, 1 coconut, 4 bananas,
2 rice, 5 diyas, 5 modaks. The bag holds 15, so it always takes at least two trips to the temple.
Between trips the monsoon clouds part and the Chaturthi moon shines: be indoors, or the light
finds you. The run ends at the temple, with the closing puja and a score.

## Puja items

Sixteen spots in `layout.ts` (see LEVEL_DESIGN.md for where and why). Each `PujaItem` has the
brief's properties — `itemId`, `itemName`, `requiredQuantity`, `currentQuantity`, `icon`,
`worldPosition` — and:

- **a model and material** — `render/art/pujaItems.ts`: a bamboo basket of marigolds and
  hibiscus, tied durva on a leaf beside a living clump, a coconut with kalava thread, a hand of
  bananas, akshata in a brass bowl, clay diyas on a tray (one lit), modaks on a thali. They rest on
  the ground, a counter or a stall — nothing floats.
- **a collider** — a small body on `Layer.Item`: rays can find it, nobody trips on it.
- **a pickup point** — the top of the arrangement, where the hand reaches.
- **an idle animation** — petals and grass in the breeze, a flickering flame, steam off the
  modaks, and an occasional glint.
- **a highlight** — a warm rim glow and a pool of light on the surface, rising as you approach and
  breathing gently when it's the prompt's target.

The bag's icons are these same models, rendered once at load into 256 px images.

## Interaction

`InteractionSystem` decides what the action button would use, every frame:

1. **Trigger detection** — each interactable owns an upright cylinder sensor (`interactRadius`);
   the player's chest point is tested against them.
2. **Availability** — collected items, houses you're already in, drop out.
3. **Line of sight** — a ray from the eyes to the prompt anchor; walls block it (not props, and
   never the object's own colliders — a door doesn't hide itself).
4. **Priority** — `priority × 1.5 m − distance − facing`: an item at your feet beats the door behind
   you, but not the one you're facing. The current target keeps a small bonus (no flicker).
5. **Prompt** — its words when they change (`ui:prompt`), its screen position every frame
   (`ui:prompt-position`).
6. **Highlight** — everything within 6 m hears how close the player is.

The action button starts the target's **animation** on the player; at the moment of contact (the
clip's midpoint) the system plays its **sound** and calls `interact`. A greyed-out prompt (a full
bag) plays a soft "no" and says why. The player controller knows nothing about any of this.

Interactables: puja items (Collect), shelter doors (Enter house / Leave house), locked doors
(Knock), the temple altar (Offer / Pray), and villagers (Talk — a few words of advice each).

The prompt: `[E] COLLECT` with a keyboard, `(A) COLLECT` with a controller, and a big tappable
`COLLECT` / `ENTER` button on touch — floating over the thing itself.

## The bag

`InventorySystem`: 15 items to start (`setCapacity` for more). Identical items stack; a pickup takes
what fits and leaves the rest lying there; nothing is taken beyond what the puja still needs. At
the temple, everything the puja still needs moves from the bag to Bappa.

It is owned by the run, not the player's body: going indoors, coming out, moonlight, exploring —
none of them touch it. **A failure under the moon empties the bag.** What you carried is gone
and the offerings are put back where they were found, to be gathered again from the start; what is
already before Bappa stays there. Nothing is left on the ground to recover.

The bag's screen (`I` or `Tab`; `Y` on a controller; the bag button on touch): slots with icons
and counts, a capacity bar, the selected item's details, and tonight's puja at the bottom. Arrow
keys / D-pad select; `Esc`, `I` or `B` close. While it's open the player stands still.

## Safe houses

Ten shelters (every house but three whose families are at the pandal, plus the farm hut). From the
street, a shelter reads by its lit doorway lamp and a warm pool of light on its veranda; a locked
house has a dark lamp, a padlock and dark windows.

Each shelter's front room is real: the walls, doorway and windows are cut in the colliders
(`solids.ts`) and the art (`houses.interior.ts`) from the same `interiorDims`. Inside: a red-oxide
floor, lime-washed walls, a devghar with its lamp burning, a cot, a trunk of quilts, brass on a
shelf. When the moon is out, moonbeams fall through each window onto the floor, barred by the
grille.

**Entering:** the door swings open → the player walks through the doorway (a scripted walk on the
real colliders) → as they cross into the room, the camera travels through the doorway to the
interior shot → the door swings shut. **SAFE** — decided every frame from where the player
actually stands. **Leaving:** the camera hands back to the follow camera, the door opens, the
player walks out onto the veranda, the door shuts behind them. The bag and the run are untouched.

`shelter.test.ts` does this for every shelter with the real controller, and checks the camera
against every wall on every frame, including through the doorway blends.

## The night

A run is one night, and only one. `src/game/night/NightClock.ts` runs 18:30 to 05:00 across 900
real seconds — one real second is forty-two of the village's — and everything the run is bounded
by hangs off it. It has three phases:

| Phase | Fraction | The village |
| --- | --- | --- |
| `evening` | 0 – 0.10 | The sun going down. **The moon cycle does not turn at all.** |
| `night` | 0.10 – 0.88 | The working hours. Three moonrises fit here. |
| `dawn` | 0.88 – 1 | The sky lightens. **No new moon may rise, ever.** |

At `t = 1` the run ends where it stands, scored with `pujaComplete: false` — see *The score*. A
moon already out when dawn arrives is never snapped off: it finishes its fading and the clouds
then stay for good (`MoonManager.retired`).

The clock exposes `t`, `phase`, `label` ("1:12 AM"), `minutesLeft`, `done`, and two numbers the
sky reads: `nightBase`, the darkness floor under the sky with no moon in it, and `dawnBlend`,
0..1 of morning. `windForward(seconds)` puts a late arrival at a team's own hour of the night.

## The moon cycle

`MoonState.ts` holds the five states and how long each lasts — safe 120 s, warning 25 s, rising
18 s, active 55 s, fading 18 s, each ±8 % by seed, with the first safe stretch shortened to 45 s
— about four minutes a turn, which is three moonrises inside the night's playable stretch — and
two curves every other system reads:

- `moonlightFor(state, progress)` → 0..1, how much moonlight is falling. It starts to climb
  during the *warning*, so the sky cools before the moon is up, and it is continuous across every
  state boundary (there is a test for that).
- `exposureRateFor(state, progress)` → 0..1, how fast being outside costs anything. It is zero
  until the moon actually rises, so the whole warning is free.

`MoonManager` is the state machine: `state`, `progress`, `moonlight`, `exposureRate`,
`dangerous`, `goingHome`, `untilMoonlight`, `retired`, `onState(listener)`, and `skipTo(state)`
for the devtools. Nothing about it is astronomical; it is a timer with a nice curve on it.

`update(dt, gate)` takes the night clock's permission with it — `ticking` (false in the evening)
and `mayRise` (false in the evening and, for good, from dawn). The gate can only hold the cycle
at `safe`, which is why a moon caught by dawn always gets to fade out first.

## Strength

`src/game/health/HealthSystem.ts` — 0–100, and the run's only failure condition.

`ExposureSystem` is the *pressure*: how much of the moon is on you this second, from the sky,
the cover overhead, your gait and how far the nearest door is. `moonPressure()` is that judgement
in one exported function, so health is costed by exactly the same maths the exposure meter uses
rather than by a second copy of it. Health is what the pressure costs:

| Where you are | What strength does |
| --- | --- |
| Outdoors, moon on you | falls, in proportion to the pressure |
| Outdoors, clouds back | **holds** — the open air mends nobody |
| Inside a shelter | comes back, after half a second, and only here |

That middle row is the whole point of the bar. Exposure clears itself outdoors once the moon has
gone, which makes a cloudy stretch a complete reprieve; health does not, so a night of being
caught out accumulates and going home is worth doing for its own sake.

An ordinary walk caught in the open runs it down in a little over twenty seconds; the worst the
village can produce — a dead run across open ground a long way from a door — in about twelve. At
zero the player is overwhelmed: the bag is emptied (see *The bag*), the nearest household
takes them in, and `revive()` puts them back on their feet with 40. Nothing here can make a run
unwinnable.

The HUD draws it under the objective (`ui/components/HealthBar.tsx`), and the cold vignette at
the edges of the screen follows it too — exposure fills in fifteen seconds and then sits pinned
at the top, which would hold the overlay at full strength for most of a bad minute.

## What the moon changes

**Light** (`MoonLightingController`). Four written-down moments — SUNSET, DUSK, MOONRISE,
MOONLIGHT — interpolated by the sky key, which is whichever is higher of the night clock's
`nightBase` and the `moonlight` actually falling. The floor is what stops a cloudy stretch at one
in the morning from being lit like the sunset the curve starts on. A fifth look, DAWN, sits off
the curve and is blended over the top of it by `dawnBlend`: a low sun from the *other* horizon,
the stars going out. Together they drive one directional light, one hemisphere light, the
sky shader, the fog, the exposure and the stars. The light is the sun until it sets and the moon
after; the hand-over happens at the darkest minute of dusk, when almost nothing is lit, so the
change of direction cannot be seen. The moon rises as the night goes on (4° → 38°), the village's
own fire (`lamps`, `flames` and the `lamplit` window material) is pushed up as the sky comes down,
and bloom stays where it was: warm against cool, not a haze. There is no mist layer: flat sheets of
it read as a milky slab across the middle of the screen once the moon was up, so the night's depth
comes from the fog alone.

**Sound** (`MoonAudioController`, `audio/Ambience.ts`). Five looping beds, all synthesised at
start-up so the game ships no recordings and owes no licence: *evening* (breeze, birds, a far-off
crowd), *night* (crickets, frogs, colder wind), *moon* (a low drone with a beat in it), *festival*
(a dhol, a crowd and small bells, positioned at the pandal) and *temple* (plucked strings and a
bell, positioned at the temple). The mix follows `moonlight`: the festival packs up, the birds
give way to crickets, and under a full moon the village all but stops. Indoors everything goes
behind a low-pass filter. Two beds are real `PannerNode`s and follow the camera's ear.

**The village** (`render/art/life.villagers.ts`, `life.dogs.ts`). Seven people are still out —
villagers, a shopkeeper, children, an elderly neighbour — walking short errands between stands.
When `goingHome` turns true they take the shortest path to their own door and go in; when the moon
has gone they come back out. They are drawn as six baked phases of a walk, swapped in turn, so a
moving villager costs no skinning, no mixer and no more draw calls than a standing one, and the
whole cast shares one set of geometry.

Three dogs sleep in the dust until the player's feet carry to them — running carries about 20 m,
walking 13, sneaking 6 — then lift their heads, then bark. Barking costs nothing: it tells the
lane you are there, and that is all. When the signs come the dogs stop wandering and settle.

**The player's own words.** At the warning and again at moonrise the devotee says what he sees.
The nine signs in the brief are the sky, the stars, the ambience thinning, the villagers going
home, the dogs settling, the temple bell, the moon's glow, that line, and the moon itself. The
only text is the small "Moonrise approaching" under the moon indicator.

## Exposure

`ExposureSystem`: 0–100, climbing only while the moon is up and the player is outside, from how
much moonlight is falling, what is overhead (open ground worst, a lane better, a veranda or the
temple's hall better still), how the player is moving (running catches the light, sneaking keeps
you out of it) and how far the nearest door is. Inside a shelter it is zero and clears fast.

At 55 the HUD says **Find shelter!**; at 100 the player is *overwhelmed* — three offerings slip
from the bag onto the ground (where they can be picked up again), the nearest household takes
them in, and exposure resets. The run continues. Nothing in the game ends a run except finishing
the puja.

The tuning is checked by tests rather than by eye: the worst case (running across open ground,
far from any door) still leaves the best part of ten seconds from the first warning, an ordinary
walk home leaves twenty, and staying under cover leaves the best part of a minute.

## The closing puja

When the last offering is given, `Gameplay` hands the run to `PujaSequence`: three held camera
shots around the devotee while he offers and bows, a bell on each cut, the sanctum's lamps rising
under it, and marigold petals and diya sparks over the platform (`render/art/temple.puja.ts`).
Every shot stays on the village side of him — the camera never comes between the god and the
person who came to see him — and the murti is only ever lit and circled. It runs about eleven
seconds and can be skipped at any point.

Then the results (`ui/components/ResultsScreen.tsx`): offerings collected and lost, doors reached
in time, moonlight encounters, time taken, route efficiency, and the score — items, shelter,
efficiency, the puja itself, time bonus, penalties — kept by `run/RunTracker.ts`. Play again
remounts the engine from nothing.

A run can also end without a puja, when 05:00 arrives first. Those runs carry
`stats.pujaComplete: false`; they are scored for everything they gathered, but the puja's own
1200 and the bonus for being quick both go to zero, and the screen says *Dawn broke first* rather
than *Puja complete*. The database's validator knows the difference: it only demands the puja's 25
offerings of a run that claims to have finished one.

## Playing together

One village, four devotees, four separate pujas.

Postgres is the referee. `supabase/migrations/` holds the tables (`profiles`, `teams`,
`team_members`, `game_sessions`, `session_players`, `player_game_results`, `team_results`), Row
Level Security (clients may only *read* their own teams' rows), and the functions every write goes
through (`create_team`, `join_team`, `leave_team`, `set_ready`, `start_game`,
`submit_player_result`, …). Each function is one transaction that locks what it needs, checks the
rules, and either succeeds completely or changes nothing — so two players can never take the last
place at once, and a code is only shown once its team row is committed. Identity is the Clerk
user id, verified by Supabase third-party auth and read from the JWT's `sub`.

Each team has a private Realtime channel, `team:<id>`, that only its active members may join. Row
changes are announced on it by triggers as a bare "something changed"; clients then refetch the
team snapshot (`get_my_team()`), so Realtime is never the source of truth. The same channel
carries Presence (who is online) and the ghosts' positions, which are never written to Postgres.

| Brief (service) | Here | What it is |
| --- | --- | --- |
| `PlayerProfileService` | `src/net/PlayerProfileService.ts` | The player's `profiles` row |
| `TeamService` | `src/net/TeamService.ts` | Create, join by code, leave, ready, start; the team snapshot |
| `TeamChannel` | `src/net/TeamChannel.ts` | The team's private Realtime channel and Presence |
| `useTeam()` | `src/ui/hooks/useTeam.ts` | The one team state every screen reads |
| `MultiplayerSessionService` | `src/net/MultiplayerSessionService.ts` | The round's moon seed and clock, heartbeat |
| `PlayerSyncService` | `src/net/PlayerSyncService.ts` | 6 Hz out, interpolation in |
| `GhostPlayerVisual` | `src/game/multiplayer/GhostPlayers.ts` | Teammates, translucent, animated |
| `ScoreService` | `src/net/ScoreService.ts` | Submitting a run, hearing what it was worth |
| `LeaderboardService` | `src/net/LeaderboardService.ts` | The two boards |
| `GameStateService` | `src/App.tsx` | menu ⇄ playing ⇄ results, and which run is starting |

**The same moon.** The round has a seed and the moment the village opened; every client
seeds its own `MoonManager` with them and winds it forward to catch up
(`MoonManager.windForward`). Not one moon message is ever sent, and everybody's sky agrees.

**Ghosts.** A teammate is the same devotee model, translucent, with a rim picking out the
silhouette, the same animation clips, and a name tag that faces the camera and fades with
distance. They have no collider at all — four players can crowd one doorway and nobody is stuck
behind anybody. At most three are drawn, and none while they are indoors.

**Everything else is individual.** The bag, exposure, shelter, the offerings given, the time, the
score: each player's own. Collecting a flower takes it from *your* world, not your friend's.

**What the client is not trusted with.** Its score, its time, its rank. `submit_player_result`
recomputes every score from the run's statistics with the same weights (`shared/score.ts`, mirrored
in SQL), refuses runs that could not have happened (a puja finished in ten seconds, a bag that
never walked anywhere, more moonlight than the run was long, a run longer than its round), checks
the player is really in that round, and refuses a second submission for it. Every accepted run is
kept; the players' board shows each player's best. A team's round score is the sum of its members'
runs in that round (`team_results`), and the team board shows each team's best round.

## The tutorial

`src/game/tutorial/Tutorial.ts` — seven steps, in the real village, with the real systems: walk to
the flowers, collect them, see the bag, find a lit door, go in, watch the moon rise past the
window, come out when it has gone. Each step ends on something the player did rather than on a
timer, and the moon runs a night in miniature (`TUTORIAL_MOON`) so the whole thing fits in two
minutes.

## Animation and sound

The character (`devotee.glb`) ships without animation, so its clips are made in code
(`player/proceduralClips.ts`): idle with breathing, slow walk, walk, run, crouch and crouch-walk,
pickup, reach, the namaste-and-bow offering, and door pushes. The walk and run plant their feet by
solving hip height from the legs each sample, and carry their stride speed so playback matches the
controller's speed.

Sounds (`audio/SoundFx.ts`) are synthesised at start-up: the pickup chime, leaves, a coconut's
thunk, grains of rice, clay, the temple bell, a door's creak and thud, a knock, the moonrise gong
and a dog's bark. The continuous beds are in `audio/Ambience.ts` (see above). A test checks every
one of them is audible, finite and never clipping.

## How hard the device works

`src/game/core/quality.ts` holds one table — low, medium, high — and everything expensive reads a
number from it: pixel ratio, shadows, MSAA, bloom, LOD and culling distances, the number of real
lights, particles and ghosts, texture size and anisotropy, and the rate the ambience is
synthesised at. `auto` picks by pointer type, cores and device memory; Settings overrides it. See
[PERFORMANCE.md](PERFORMANCE.md).

## Tuning

Every number lives in one place: `CameraConfig.ts`, `playerConfig.ts`, `DEFAULT_INTERACTION_CONFIG`,
`DEFAULT_SHELTER_CONFIG`, `DEFAULT_MOON_CONFIG`, `DEFAULT_EXPOSURE_CONFIG`,
`DEFAULT_SCORE_WEIGHTS`, the `LOOKS` table in `MoonLightingController.ts`, and the item catalogue
in `shared/items.ts`.

## Developer tools

In `npm run dev`, `window.__seva` drives the game for testing: `teleport`, `look`,
`await walkTo(x, z, { run })`, `moon('active')` (or `'safe' | 'warning' | 'rising' | 'fading'`),
`give('flowers', 3)`, `interact()`, `await enter('patil')`, `await leave()`, and `info()`
(position, state, area, safe, exposure, moon, bag, target, draw calls).

## The village map

`game/map/MapSystem.ts` holds the rules, `ui/map/` draws them. Nothing is marked at the start. A
villager who knows about an offering (`HINTS`) turns it into a faint *hint* — a soft glow round the
nearest named house or shop, with a sentence such as "South-west · near the Patils’ house" — and
walking within 12 m turns it into a clear *pin*. Picked-up offerings leave the map; if the moonlight
takes the bag and they are put back, they return. The map is always north-up (north is −z, where the
temple is). It is a canvas painted from `VILLAGE`, so it cannot drift from the level: a corner
minimap centred on the player, and a full map on **M** (or the MAP button on a phone) with a compass
and the same hints in words. While it is open, movement and the action button wait, as with the bag.

The offering at the temple is a kneeling pranam (`Pranam`, 4.6 s, `proceduralClips.ts`): namaste,
down onto the knees, forehead toward the ground with the hands stretched forward, and back up.
The offering lands at the deepest point of the bow.

## The people

Three characters, all on the same 64-bone skeleton, built by `tools/blender/build_characters.py`
from MPFB (CC0) into `public/assets/models/`: the man (`devotee.glb`, who is also the player), a
woman in a saree (`woman.glb`) and the priest (`pujari.glb`, dhoti, saffron shawl, marigold garland,
rudraksha beads, tripundra). Skin pores come from one shared tileable normal map
(`public/assets/textures/skin_pores.png`, applied at runtime by `player/skinDetail.ts`).

Every villager is a real skinned person with a mixer (`render/art/folk.ts`), so they move smoothly and
are never a statue. `player/activityClips.ts` holds the slow looping work — Sweep, Rangoli, Wipe,
Garland, HoldUp, Talk, Listen, Lamp, Arrange, Stringing, SitStool, SitEdge, Aarti, Pray, CarryWalk —
and `activity.test.ts` measures each against the real skeleton (a sweeping hand stays low, a
garland-hanger's hands stay over the head, the loop closes). The namaste is *solved per skeleton*
(`fitNamaste`) so the palms actually meet. People at their work come from `layout.villagers`
(`kind`, `activity`); people walking the lanes are in `render/art/life.villagers.ts`, slowly, and go
home when the signs come. Props (broom, aarti lamp and bell, water pot, marigold string) are in
`folkProps.ts`.

# Moonlight Seva — gameplay systems

How the run works in code: the puja items, the interaction system, the bag, safe houses, the
moon and purity. Everything here is TypeScript on Three.js and Rapier (the project's stack); the
brief's Unity names map one-to-one onto files:

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

`src/game/Gameplay.ts` owns the run (bag, moon, purity, interaction, shelter) and updates them
in order each frame; `Engine.ts` owns rendering and the loop. React only ever sees plain events
(`src/shared/events.ts`).

## The loop

The puja needs 25 things (`src/shared/items.ts`): 5 flowers, 3 durva, 1 coconut, 4 bananas,
2 rice, 5 diyas, 5 modaks. The bag holds 15, so it always takes at least two trips to the temple.
Between trips the monsoon clouds part and the Chaturthi moon shines: be indoors, or lose purity.

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
(Knock), the temple altar (Offer / Pray), villagers (Talk — a few words of advice each), and the
bundle you drop when the moon overwhelms you (Collect).

The prompt: `[E] COLLECT` with a keyboard, `(A) COLLECT` with a controller, and a big tappable
`COLLECT` / `ENTER` button on touch — floating over the thing itself.

## The bag

`InventorySystem`: 15 items to start (`setCapacity` for more). Identical items stack; a pickup takes
what fits and leaves the rest lying there; nothing is taken beyond what the puja still needs. At
the temple, everything the puja still needs moves from the bag to Bappa.

It is owned by the run, not the player's body: going indoors, coming out, moonlight, exploring —
none of them touch it. **A failure under the moon drops half the bag (rounded down) where you
stand, as a bundle you can pick up again** — never the whole bag, never a lone item, never
anything already offered.

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

## The moon and purity

`MoonCycle`: day (45 s) → dusk (20 s) → moonrise (5 s, the grace to reach a door) → moonlight
(25 s) → moonset (6 s), each ±10 % by seed; the first calm lasts 70 s. The sky tells the player,
never a countdown: at dusk the sun sinks and shadows stretch; at moonrise a gong sounds and the
light swings to a high, cold moon; in moonlight the sky is deep blue with stars, and the screen's
edges go cold while you're exposed.

`PuritySystem`: in moonlight, outdoors drains purity (8/s on open ground, 5/s among the houses);
indoors nothing drains and purity recovers. Praying at the temple restores it fully. At zero the
player is overwhelmed: half the bag falls (see above) and purity comes back to 40.

## Animation and sound

The character (`devotee.glb`) ships without animation, so its clips are made in code
(`player/proceduralClips.ts`): idle with breathing, slow walk, walk, run, crouch and crouch-walk,
pickup, reach, the namaste-and-bow offering, and door pushes. The walk and run plant their feet by
solving hip height from the legs each sample, and carry their stride speed so playback matches the
controller's speed.

Sounds (`audio/SoundFx.ts`) are synthesised at start-up: the pickup chime, leaves, a coconut's
thunk, grains of rice, clay, the temple bell, a door's creak and thud, a knock, the moonrise gong.

## Tuning

Every number lives in one place: `CameraConfig.ts`, `playerConfig.ts`, `DEFAULT_INTERACTION_CONFIG`,
`DEFAULT_SHELTER_CONFIG`, `DEFAULT_MOON_CONFIG`, `DEFAULT_PURITY_CONFIG`, and the item catalogue in
`shared/items.ts`.

## Developer tools

In `npm run dev`, `window.__seva` drives the game for testing: `teleport`, `look`,
`await walkTo(x, z, { run })`, `moon('moonlight')`, `give('flowers', 3)`, `interact()`,
`await enter('patil')`, `await leave()`, and `info()` (position, state, area, safe, purity, moon,
bag, target, draw calls).

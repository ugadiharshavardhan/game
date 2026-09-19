# Moonlight Seva — Art Brief

How the village is drawn: visual direction, the shared art toolkit, and a spec per art module.
Code lives in `src/game/world/village/render/art/`.

---

## 1. Visual direction

**A Maharashtrian village on the evening of Ganesh Chaturthi.** Late monsoon: humid, warm air,
a low sun in the west-south-west, long shadows, violet haze in the distance. The village is quiet
and earthy; the festival adds small, bright accents — marigolds, mango leaves, saffron cloth, lamp
flame — against lime-washed walls, clay tiles, teak and stone.

**Do**
- Earthy, sun-faded materials: lime-wash, geru (red-oxide), indigo wash, turquoise, ochre; clay
  tile; teak; basalt and sandstone; packed earth.
- Environmental storytelling: things half-prepared for the puja, rangoli at thresholds, lamps being
  lit, garlands being hung, offerings laid out at stalls, doors closed and padlocked where a family
  has gone to the pandal.
- Weathering everywhere (use `weather()`): monsoon splash at the base of walls, soot under eaves.
- Human scale: doors 2.1 m, plinths 0.45 m, steps 0.15 m rises. Check against the 1.62 m player.

**Don't**
- Generic fantasy, European, or futuristic forms. No neon. No saturated "game" colours except
  flowers and flame.
- Arcade signifiers: no floating diamonds, spinning pickups or glowing outlines in the art pass.

**Cultural care (non-negotiable)**
- Ganesha is shown respectfully. The temple's mūrti is a *svayambhu*-style form: a rounded stone
  smeared with sindoor (vermilion), draped with a marigold garland, with lamps before it — the way
  countless village shrines keep him. Do not attempt a sculpted face or body; a crude figure reads
  as disrespect.
- The pandal's idol has not yet arrived — the village is preparing. The stage shows a draped chowki
  (low seat), kalash, flowers and lamps, awaiting him.
- The vahana is the mouse (mūshak), shown as a small stone mouse facing the sanctum.
- Offerings are real ritual objects: modak, durva grass, red hibiscus, coconut, diyas, kumkum,
  banana leaves, marigolds, incense. Present them with care (plates, baskets, cloth), never as junk.

---

## 2. The toolkit (read these before writing a module)

| File | What it gives you |
| --- | --- |
| `houses.ts` | **The reference module.** Match its structure, level of detail, naming and comments. |
| `geom.ts` | `Batch` (merge per material), `box`, `slab`, `boxUV`, `weather`, `fill`, `quad`, `tri`, `pitchedRoof`, `leanTo`, `cap`, `beam`, `orient`, `lathe`, `turnedPost`, `catenary`, `place` |
| `materials.ts` | `MaterialKit`: `kit.get(key)` for shared materials (`plaster stone rubble brick tile wood teak bark fabric thatch paint iron brass interior lamplit foliage palm banana grass flame glow water`); `kit.custom(key, make)` for one-offs; `kit.decal(key, tex)` for ground decals. UVs are baked in metres ÷ `TILE[key]`. |
| `palette.ts` | `WALL_PAINT`, `DADO_PAINT`, `WOOD_PAINT`, `TONE` — use these, don't invent colours. |
| `canvasTextures.ts` | Painted textures: `leafAtlas` (+`LEAF_QUAD`), `palmFrond`, `bananaLeaf`, `grassTuft`, `thatch`, `rangoli`, `signboard`, `pandalBackdrop`, `festivalBanner`, `flame`, `glow`, and `rng(seed)`. Add new painters **in your own file** via `a.bank.canvas('<module>:<name>', …)`. |
| `textures.ts` | `a.bank.set(name)` for CC0 PBR sets (Color/Normal/ORM). |
| `runtime.ts` | `ArtContext` (see below), `FlameField`, `LampPool`, `Culler`. |
| `ground.ts` | `a.ground.heightAt(x,z)`, `a.ground.surfaceAt(x,z)` (road/soil/paving/lush weights), `a.ground.outside(x,z)` (metres outside the playable edge). |
| `../../dims.ts` | Shared measurements (`houseDims`, `shopDims`, `templeDims`, `toWorld`, `PLINTH_H`, step sizes…). |
| `../../solids.ts` | The colliders. **Your visuals must match these** (§3). |
| `../../layout.ts`, `../../types.ts` | The village data. |

**`ArtContext` (`a`)** — everything goes under `a.root`.
- `a.kit`, `a.bank` — materials and textures.
- `a.flames.add(worldPos, size)` — a flickering flame (diya = 1). Never make your own flame meshes.
- `a.lamps.anchor(worldPos, intensity, colour?, distance?)` — a lamp that may receive one of the six
  pooled real lights. **Never create PointLights yourself.**
- `a.culler.add(object, centre, maxDistance)` — hide small detail when far.
- `a.tick.push((dt, time, cameraPos) => …)` — per-frame animation (keep it cheap).
- `a.ground`, `a.layout`, `a.level`, `a.shared.templeGlow` (0..1 after a prayer).

**Module contract** — `export function build(a: ArtContext): boolean` (or async). Return `true` once
your features are drawn; the greybox then stops drawing them.

**Conventions** — metres, y up, north = −z. A building's door faces its local +z, rotated by `rot`
about y (`toWorld(o, rot, lx, lz)`); `rot`: 0 = faces south, π = north, π/2 = east, −π/2 = west.
Build in a local frame, merge with `Batch`, place with the group's position/rotation.

**Performance** (WebGL, mid-range laptop and phone): merge static geometry per material; use
`InstancedMesh` for anything repeated more than ~20 times; LOD or cull detail beyond ~40 m; small
props don't cast shadows. Stay inside your module's draw-call and triangle budget.

---

## 3. Collision parity

The layout's solids (`solids.ts`) are the truth for collision **and camera collision**. Anything the
player or camera can hit must look like what it is:
- Match each solid's footprint and height closely (±5 cm). Visual detail may add a little outside
  (cornices, garlands, leaves) but never leave a visible gap where the collider is, and never draw a
  wall where there is no collider.
- Don't add solid-looking things the player can walk through (a pot in the road) unless they are
  obviously soft (grass, crops, cloth, small flowers) or out of reach (up high).
- If your design needs a collider change, don't edit `solids.ts` — say so in your report.

---

## 4. Working method

- **Only edit your module's files** (`<module>.ts`, and any new `<module>.*.ts` you create).
  Shared files belong to the lead; request changes in your report.
- The dev server is already running at `http://127.0.0.1:5173` — don't start or stop servers.
- Preview only your module: `http://127.0.0.1:5173/?only=ground,<module>` (add `houses` for
  context). Everything not built is greybox.
- In the page (dev only): `__seva.teleport(x, z, yawDeg)`, `__seva.look(yawDeg, pitchDeg)`,
  `__seva.info()` (position, draw calls, triangles). Camera yaw: 0 looks south (+z), 180 north,
  90 east, −90 west.
- Screenshots: `node <scratchpad>/cdp.mjs steps.json --width 1280 --height 720 --out <dir>` where
  steps.json is `{ "url": …, "steps": [ { "eval": "js", "waitFor": "js", "wait": ms, "shot": "name.png" } ] }`.
  Click Play first (see an existing steps file), wait for `window.__seva`, then teleport/look/shot.
  Headless Chrome renders in software: allow 30–90 s per run. If the page reloads mid-run
  (another module saved), just rerun.
- **Iterate on what you see**: review every screenshot critically at several viewpoints and
  distances, including close-ups at player height. Fix floating objects, z-fighting, wrong scale,
  over-saturation, texture stretching and gaps against colliders.
- Typecheck only your files: `npx tsc -b 2>&1 | grep 'render/art/<module>'` (other modules may be
  mid-edit). Lint: `npx oxlint src/game/world/village/render/art/<module>*.ts`.
- Report: what you built, screenshots you're proudest of (paths), draw calls and triangles added
  (compare `?only=ground` against `?only=ground,<module>` at the same viewpoint), anything
  unfinished, and any shared-file changes you need.

---

## 5. Module specs

### temple — `temple.ts`
**Colliders to match** (`solids.ts` → Temple, walls `temple-*`, landmarks `deepastambha`, `shrine`):
stone platform (jagati) 12 × 14 m × 0.9 m centred (0, −51) with steps on the south face (4 m
wide, five 0.15 m rises, ramp underneath); sanctum (garbhagriha) 6 × 6 m, 4.2 m tall on the
platform from z −50.2 to −56.2; shikhara hull rising 9.5 m above the sanctum; mandapa pillars
(r 0.24, 3.1 m) at x ±1.3, ±3.4 and z −44.95, −47.8; mandapa roof slab at platform + 3.35;
courtyard wall 1.6 m tall, 0.5 m thick, gates on the south (x ±2.6 at z −38) and on the east and
west walls (z −43.8…−47.2); deepastambha r 0.5 × 4.6 m at (−5, −41.4); mūshak pedestal
0.8 × 1.0 × 0.9 m at (0, −40.3). The offering point is (0, −49.2) on the platform, in the mandapa.

**Build:** a Nagara-style shikhara — curvilinear tower of horizontal bands with vertical ribs,
amalaka (ribbed disc) and kalasha finial, a saffron flag on a staff; the sanctum with a south
doorway (carved frame, threshold), inside it the sindoor-smeared svayambhu Ganesha with marigold
garland and two brass samai lamps (flames + one lamp anchor), glowing brighter with
`a.shared.templeGlow`; the mandapa with turned stone pillars and bracket capitals, flat roof with
parapet and small kalash finials, brass bells at the entrance; moulded platform (stacked
mouldings, not a plain box) and steps with low side walls; deepastambha — a stone lamp tower with
rows of niches and lit diyas; the mūshak on its pedestal facing the sanctum; the courtyard wall in
dressed stone with coping, and a south gateway arch (kaman) with a bell and a toran; marigold
garlands on the mandapa. It is the landmark seen from everywhere — make the silhouette read at
100 m. Two levels of detail (full / distant).
**Budget:** ≤ 30 draw calls, ≤ 80k triangles.
**Viewpoints:** approach from (0, −30) yaw 180; the steps (0, −41) yaw 180 pitch 15; inside the
mandapa (0, −48.5) yaw 180; from the square (0, 10) yaw 180 (silhouette); side (−14, −45) yaw 120.

### trees — `trees.ts`
**Colliders to match:** trunks (`tree:<kind>`) — cylinders, base radius banyan 1.1, peepal 0.7,
neem 0.3, mango 0.34, coconut 0.2, banana 0.15 (× the tree's scale), up to 4 m (banana 2 m); the
banyan's round platform (chabutra) r 3.2 × 0.5 m at (−9, 8); hedges (`fence:` of kind hedge):
0.8 m thick × 1.15 m along their polylines.

**Build:** banyan (massive, several trunks, aerial prop roots, a canopy ~8 m radius, the stone
chabutra with red threads tied round the trunk and a few diyas); peepal (heart-shaped leaves, tall);
neem (fine feathery foliage); mango (dense dark dome, some copper new leaves); coconut palms
(curved ringed trunk, drooping fronds, coconut clusters); bananas (pseudostem, big torn leaves, some
with a hanging bunch and purple flower). Alpha-card foliage (`foliage` with `LEAF_QUAD`, `palm`,
`banana`), `bark` trunks, instanced. Undergrowth: grass tufts where the ground is grass (use
`a.ground.surfaceAt`; avoid roads, paving, soil and building footprints), chunked for culling;
shrubs and wildflowers; the garden's hibiscus shrubs and marigold beds (garden area in layout).
Crops in the three fields (`layout.fields`): millet with seed heads, sugarcane, vegetable rows —
walkable (no colliders), rows aligned to the field. Leafy hedges on the hedge lines. Tree clumps on
the hills beyond the playable edge (`a.ground.outside(x,z) > 3`, heights from `heightAt`) so the
horizon isn't bare. Optional gentle wind sway.
**Budget:** ≤ 40 draw calls, ≤ 220k triangles. Big trees cast shadows; grass doesn't.
**Viewpoints:** banyan (−2, 14) yaw 200; orchard (44, −24) yaw 90; grove (44, 20) yaw 90; bananas
(18, −26) yaw 90; fields (−44, 30) yaw −90; garden (−33.5, −20) yaw −90; a lane (−20, 24) yaw −90.

### shops & props — `shops.ts`, `props.ts`
**Colliders to match:** shops — body box (width + 0.3) × 3.9 m × (depth + 0.3) centred on the shop;
counter (width − 0.4) × 0.92 × 0.7 m at the front (`shopDims`); two awning poles (r 0.06, 2.35 m).
Walls (`wall:` except temple): polylines, `height` × `thickness`. Bamboo fences: 0.12 × 1.1 m.
Landmarks (see `landmarkSolids()`): wells (r 1.05 × 0.85), tank rim (9 × 6.9, 0.6 m, water inside),
tulsi (0.85 × 1.0), flower stall, potter, fruit stall, puja stall, cart, haystacks (r 1.45 × 2.4),
scarecrow, handpump.

**Build — shops:** open shopfronts with a shallow visible interior behind the counter (the
collider is the full box; nobody walks in). *Ganesh Kirana* (−9, 30): shelves of jars, sacks and
tins, hanging strips of sachets, a balance scale, gunny sacks of grain outside, painted signboard
(`signboard()`), tin/tarp awning, a bare bulb (lamp anchor). *Laxmi Mithai* (−9, −30): glass-front
display with trays of modak, laddoo, jalebi and barfi, a big kadhai on a stove behind, sign,
lanterns, garlands. **Props:** compound walls (brick or plastered, coping, gate posts at gaps),
the tulsi garden's rubble wall, bamboo field fences, the wells (stone ring, wooden pulley frame,
rope, bucket), the village tank (stepped stone ghat, water surface with the `water` material,
lotus pads), tulsi vrindavans (ornate painted planter with a tulsi bush and diya niche), the flower
stall (heaps of marigolds, garlands), the potter (stacked pots, diyas on a mat, a wheel), the fruit
stall (bananas, coconuts, mangoes), the puja stall by the temple gate (incense, camphor, kumkum,
coconuts), the bullock cart (big spoked wooden wheels, no bullocks), haystacks, a scarecrow with a
clay-pot head, the iron handpump on a concrete apron.
**Budget:** ≤ 45 draw calls, ≤ 100k triangles.
**Viewpoints:** kirana (−2, 30) yaw −90; sweets (−2, −30) yaw −90; tank (−22, −37) yaw 0 pitch 25;
garden gate (−30, −20) yaw −90; farm (−44, 44) yaw −90; square stalls (−2, 2) yaw −90.

### festival — `festival.ts`
**Colliders to match:** the pandal at (11.5, 5), open toward the west: stage 7 × 0.7 × 2.5 m at the
back; six bamboo poles (r 0.08 × 4.2 m) at local (±4.5, −3.5), (±4.5, 0), (±4.5, 3.5); cloth side
walls at local x ±4.5 (0.1 × 2.8 m, z −3.5…1.7).

**Build:** the pandal — bamboo frame with cross-members, a tented fabric roof in saffron and maroon
with a scalloped valance and tassels, fabric side walls, the painted backdrop (`pandalBackdrop()`)
behind the stage, carpet, the draped chowki awaiting the idol, kalash with mango leaves and
coconut, brass samai lamps (flames, one lamp anchor), garland arcs, tiny string-light bulbs, banana
stems tied at the entrance posts, a toran across the front. The street: triangle bunting and
`festivalBanner()` banners across the main road, saffron flags on bamboo poles and string lights
around the festival ground, a large rangoli at (0, 4), paper lanterns along the lanes, diyas along
the main road's last stretch to the temple gate (outside the courtyard — inside is the temple's).
**Offerings:** a respectful prop at each of the 12 offering spots (`layout.offerings`: id, item,
x, z, y) — modak on a brass plate, a bundle of durva tied with thread, a basket of red hibiscus,
coconuts, a stack of clay diyas, a kumkum box, cut banana leaves, a basket of marigolds, incense
sticks. Where a spot is on a counter or stall, sit the prop on that surface. Name each group
`offering:<id>` (the inventory system will hide them when collected). Subtle presence, not arcade.
**Budget:** ≤ 35 draw calls, ≤ 80k triangles. Cloth may sway gently (`a.tick`).
**Viewpoints:** pandal (0, 5) yaw 90; square overview (−10, 16) yaw 150 pitch 25; main road
(0, 30) yaw 180; temple gate approach (0, −26) yaw 180; each offering spot at 2–3 m.

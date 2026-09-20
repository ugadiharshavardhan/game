# Moonlight Seva — performance

What the game costs, where the cost is, what has been done about it, and what has not.

Numbers below were measured in headless Chrome on an Apple-silicon Mac (ANGLE/Metal) at 1280×720,
and in Chrome's phone emulation at 844×390 with `deviceMemory`/`hardwareConcurrency` reported by
the host machine. **Emulation is not a phone**: it gives honest draw-call and memory figures and
dishonest frame times. The last section says what still needs a real device.

## The one knob: quality profiles

`src/game/core/quality.ts` is the only place a performance decision is made. Everything else reads
a number from it. `auto` picks by pointer type, core count and device memory; the player can
override it in Settings.

| | low (phone) | medium (laptop) | high (desktop) |
| --- | --- | --- | --- |
| Pixel ratio cap | 1 | 1.5 | 2 |
| Shadows | off | 1536² | 2048² |
| MSAA | 0 (browser AA) | 2× | 4× |
| Bloom | off | on | on |
| LOD / cull distances | ×0.68 | ×0.85 | ×1 |
| Real point lights | 3 | 5 | 6 |
| Ambient particles | 40 | 90 | 140 |
| Texture width cap | 512 | 1024 | 2048 |
| Anisotropy | 2 | 4 | 8 |
| Ghost teammates drawn | 2 | 3 | 3 |
| Ambience synthesis rate | 16 kHz | 22 kHz | 22 kHz |

## Measured

| Where | Draw calls | Triangles | Frame rate |
| --- | --- | --- | --- |
| Home lane, evening (medium, auto-picked) | 294 | 568k | 60 (capped) |
| Festival ground, evening (high) | 365 | 850k | 60 (capped) |
| Festival ground, moonlight (high) | 371 | 848k | 60 (capped) |
| Temple court, moonlight (high) | 136 | 522k | 60 (capped) |
| Greybox village (no art) | 80 | 77k | 60 (capped) |

Start-up: Rapier + Three.js + the village build ≈ 9 s cold on the dev server, ~3 s from the
production build. Ambience synthesis (five looping beds, made in code): 92 ms, once, behind the
loading screen.

## The heaviest things in the game

1. **The engine chunk — 3.36 MB (1.23 MB gzipped).** Three.js plus Rapier's embedded WASM. It is
   lazy-loaded when the player presses Play, so the menu does not pay for it. This is the single
   biggest number in the project and the hardest to move without dropping a dependency.
2. **The village's draw calls — ~370 at the festival ground.** Houses, shops and the temple are
   already merged per material and have three levels of detail each; what remains is genuinely
   separate material state. The quality profile pulls the LOD distances in by up to a third.
3. **PBR texture sets — 3.7 MB on disk, and far more in video memory.** A 2K set is ~16 MB of
   video memory with mipmaps. `TextureBank` now redraws every texture down to the profile's cap
   at load (512 px on a phone), which is a ~16× memory saving there.
4. **`devotee.glb` — 1.05 MB, 17k triangles, 8 meshes.** Used by the player, the standing
   villagers (baked to static geometry), the walking villagers (six baked frames, shared) and the
   ghost teammates (the only skinned copies in the game, capped at 2–3).
5. **The post-processing chain.** A half-float MSAA target plus UnrealBloom. Both are off on low.
6. **Audio.** 120 KB of CC0 footstep/cloth samples; every other sound in the game — the five
   ambience beds and sixteen one-shots — is synthesised at start-up, so it costs nothing to
   download and nothing in licences.

## Checklist

Done:

- [x] **LOD** — houses (3 levels), shops (2), temple (2); every level distance scaled by quality
      in one place (`VillageArt`).
- [x] **Distance culling** — one `Culler`, scaled by quality; villagers, dogs, decals, props.
- [x] **Frustum culling** — Three's default, kept on everything except the skinned characters
      (which need it off, or they vanish when their bind pose leaves the frustum).
- [x] **Texture size optimisation** — per-profile cap, applied at load on the GPU.
- [x] **Limited real-time shadows** — exactly one shadow-casting light, ever; a snapped
      shadow frustum that follows the player; shadows off entirely on low.
- [x] **Efficient lighting** — one directional light, one hemisphere light, and a pool of 3–6
      point lights that follows the player's nearest lamps (the shader's light count never
      changes, so materials never recompile).
- [x] **Pooled particles** — flames, ambient dust and fireflies, and the puja's petals are all
      fixed-size pools; nothing is allocated after the first frame.
- [x] **Pooled NPCs** — the walking villagers share six baked frames of one walk cycle; a moving
      villager costs no skinning, no mixer and no more draw calls than a standing one.
- [x] **Contact shading baked into vertex colours** — the bottom few centimetres of every solid
      thing are taken down by a sixth, so buildings sit *into* the lane instead of on top of it.
      Free at runtime; lights, flames and ground decals are excluded by name and by shape.
- [x] **Optimised materials** — merged per material by `Batch`; small metal fittings remapped to
      painted colour to drop whole materials; `customProgramCacheKey` on every patched shader so
      variants are shared.
- [x] **Reduced polygon counts** — LOD levels drop detail geometry entirely rather than
      decimating it; the greybox is the fallback for anything unfinished.
- [x] **Compressed audio** — CC0 samples are MP3; everything else is synthesised, and at a lower
      sample rate on low.
- [x] **Low memory** — every system disposes its geometry, materials and textures; the icon
      render target is released after the bag's icons are made.
- [x] **Network** — position updates at 10 Hz, rounded to the centimetre, only when something
      changed, and never echoed back to the sender.

Deferred, with reasons:

- [ ] **Texture compression (KTX2/Basis)** — the encoder is written
      (`tools/textures/encode-ktx2.mjs`) and not yet run: it needs the KTX tools installed and it
      pins every core for minutes, so it wants a machine nobody is playing on. The file's header
      says what to change in `TextureBank` afterwards. The runtime downscale above is the
      stop-gap; it saves the memory but not the download.
- [ ] **Baked lighting** — the village is lit by one moving light whose colour and direction
      change through the evening, so a baked lightmap would have to be baked per moon state. The
      cheap half of it (vertex-baked contact shading on static geometry) is where to start.
- [ ] **Occlusion culling** — distance culling only. Real occlusion queries are not worth it for a
      village this open; the lanes rarely hide much.
- [ ] **Draw-call batching across materials** — would need a texture atlas per material family.

## Still to test on real hardware

The three targets in the brief, and what each needs checking for:

| Target | What to watch |
| --- | --- |
| Desktop (discrete GPU) | Sustained 60 fps at the festival ground on high; bloom not overcooked |
| Mid-range laptop (integrated GPU) | Frame time at dusk with shadows on; auto should pick medium |
| Phone browser (iOS Safari, Android Chrome) | Auto picks low; memory after ten minutes; touch controls; audio unlock on first tap |

Open the game with **`?perf=1`** — on any build, including the production one — and a small
overlay reports frame rate, draw calls, triangles, the quality profile that was chosen and the JS
heap. It is off unless asked for (the engine does not even count frames without the flag), so it
costs nothing in a normal run. `npm run dev` prints a LAN address to open on a phone.

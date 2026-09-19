/**
 * The farm's props: the unhitched bullock cart by the farm lane, the kadba haystacks and the
 * scarecrow in the jowar. Each sits inside its collider (see solids.ts › landmarkSolids).
 */
import { Color, CylinderGeometry, IcosahedronGeometry, TorusGeometry, Vector3 } from 'three';
import type { LandmarkDef } from '../../types';
import { Batch, beam, box, fill, weather } from './geom';
import { TONE } from './palette';
import { at, featureRoot, GRAIN, hashId, latheM, lodOf, MATKA, mound, pot, rod, sack, shade } from './props.parts';
import type { ArtContext } from './runtime';

const WOOD = '#7a5a3c';

// ---- Bullock cart ---------------------------------------------------------------------------------

/**
 * A bullock cart (bail gaadi) resting on its prop: two tall spoked wheels, a slatted bed with
 * bamboo side stakes, the long pole (dhuri) running forward onto a forked stand, and the day's
 * load — a couple of grain sacks and a bundle of fodder. Collider: 1.5 × 1.4 × 3.2 m, centred.
 */
export function cart(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:cart:${l.id}`, l.x, l.z, l.rot);
  const full = new Batch();
  const far = new Batch();
  const seed = hashId(l.id);
  const R = 0.64; // wheel radius: the axle sits at R
  const bedY = R + 0.2;

  for (const [b, lvl] of [[full, 0], [far, 1]] as const) {
    for (const sx of [-1, 1]) {
      const x = sx * 0.66;
      // Rim with an iron tyre, hub, spokes.
      b.add('wood', weather(new TorusGeometry(R - 0.04, 0.045, 5, lvl ? 14 : 28).rotateY(Math.PI / 2).translate(x, R, 0), WOOD, { ground: 0, splash: 0.5, strength: 0.4, seed }));
      if (!lvl) b.add('iron', new TorusGeometry(R - 0.005, 0.014, 4, 32).rotateY(Math.PI / 2).translate(x, R, 0));
      b.add('wood', fill(new CylinderGeometry(0.1, 0.1, 0.2, lvl ? 8 : 12).rotateZ(Math.PI / 2).translate(x, R, 0), new Color(WOOD).multiplyScalar(0.8)));
      const spokes = lvl ? 6 : 12;
      for (let k = 0; k < spokes; k++) {
        const t = (k / spokes) * Math.PI * 2;
        const hub = new Vector3(x, R + Math.sin(t) * 0.09, Math.cos(t) * 0.09);
        const rim = new Vector3(x, R + Math.sin(t) * (R - 0.07), Math.cos(t) * (R - 0.07));
        b.add('wood', rod(hub, rim, 0.022, 5, false), WOOD);
      }
    }
    // Axle, the two long side beams that carry the bed and become the pole, cross slats.
    b.add('wood', fill(new CylinderGeometry(0.045, 0.045, 1.3, 8).rotateZ(Math.PI / 2).translate(0, R, 0), '#4e3a28'));
    for (const sx of [-1, 1]) b.add('wood', weather(beam(new Vector3(sx * 0.42, bedY - 0.08, -1.05), new Vector3(sx * 0.42, bedY - 0.08, 0.95), 0.1, 0.12), WOOD, { ground: 0, strength: 0.2, seed }));
    b.add('wood', weather(box('wood', 1.02, 0.05, 1.95, 0, bedY, -0.08), '#8a6a48', { ground: bedY, strength: 0.15, seed }));
    // The pole: the side beams converge to one timber that runs down onto the stand.
    const tip = new Vector3(0, 0.62, 1.55);
    for (const sx of [-1, 1]) b.add('wood', weather(beam(new Vector3(sx * 0.42, bedY - 0.08, 0.95), new Vector3(0, bedY - 0.12, 1.25), 0.09, 0.1), WOOD, { ground: 0, strength: 0.2, seed }));
    b.add('wood', weather(beam(new Vector3(0, bedY - 0.12, 1.2), tip, 0.09, 0.1), WOOD, { ground: 0, strength: 0.2, seed }));
  }

  // Close-up detail: bed slats, side stakes and rails, the stand, the yoke on the ground, the load.
  for (let k = 0; k < 9; k++) full.add('wood', fill(box('wood', 1.0, 0.02, 0.16, 0, bedY + 0.035, -0.98 + k * 0.215), new Color('#8f6e4a').multiplyScalar(0.9 + ((seed + k) % 5) * 0.03)));
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const z = -1.0 + k * 0.37;
      full.add('paint', rod(new Vector3(sx * 0.49, bedY, z), new Vector3(sx * 0.53, bedY + 0.48, z), 0.02, 5, false), '#b49b63');
    }
    full.add('paint', rod(new Vector3(sx * 0.52, bedY + 0.42, -1.04), new Vector3(sx * 0.52, bedY + 0.42, 0.9), 0.022, 5, false), '#a88e58');
  }
  // Forked stand under the pole's tip.
  for (const sx of [-1, 1]) full.add('wood', rod(new Vector3(sx * 0.12, 0, 1.52), new Vector3(sx * 0.02, 0.6, 1.55), 0.03, 5, false), '#5e4630');
  // The yoke (juu), set down beside the pole, with its rope.
  full.add('wood', weather(beam(new Vector3(-0.62, 0.06, 1.3), new Vector3(0.52, 0.06, 1.46), 0.09, 0.09), '#6a4e34', { ground: 0, strength: 0.25, seed }));
  full.add('paint', rod(new Vector3(-0.2, 0.1, 1.35), new Vector3(0.1, 0.1, 1.4), 0.02, 5, false), '#8a7550');
  // Load: two grain sacks and a tied bundle of green fodder.
  sack(full, at(-0.22, bedY + 0.03, -0.62, 0.3, 0.9), GRAIN.jowar, seed);
  sack(full, at(0.2, bedY + 0.03, -0.35, -0.5, 0.85), GRAIN.wheat, seed + 1);
  const fodder = mound(0.36, 0.3, seed + 2, 2, 0.2);
  fodder.scale(1, 1, 1.5).translate(0.05, bedY + 0.04, 0.35);
  full.add('thatch', weather(fodder, '#8c9a4c', { ground: bedY, strength: 0.25, seed }));
  // Festival touch: a marigold string tied across the front stakes.
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const p = new Vector3(-0.52 + t * 1.04, bedY + 0.4 - 0.12 * 4 * t * (1 - t), 0.86);
    full.add('paint', new IcosahedronGeometry(0.035, 0).translate(p.x, p.y, p.z), k % 2 ? TONE.marigold : TONE.marigoldYellow);
  }

  const f0 = full.build(a.kit, { name: `cart:${l.id}`, cast: true, noShadow: ['paint', 'iron'] });
  const f1 = far.build(a.kit, { name: `cart:${l.id}:far`, cast: false });
  root.add(lodOf([[f0, 0], [f1, 34]], 100));
  a.root.add(root);
}

// ---- Haystack ---------------------------------------------------------------------------------------

/**
 * A kadba stack: sorghum straw built up round a centre pole into a bellied cylinder with a
 * conical cap, the pole's tip poking out, straw ropes binding the cap, loose straw at the foot.
 * Collider: a 1.45 m cylinder, 2.4 m tall.
 */
export function haystack(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:haystack:${l.id}`, l.x, l.z, l.rot);
  const full = new Batch();
  const far = new Batch();
  const seed = hashId(l.id);
  const profile: [number, number][] = [
    [0.001, 0], [1.3, 0], [1.38, 0.3], [1.44, 0.9], [1.42, 1.4], [1.3, 1.62], [1.36, 1.66], [0.9, 1.98], [0.45, 2.24], [0.12, 2.38], [0.001, 2.4],
  ];
  const straw = new Color(TONE.thatch).offsetHSL(0, -0.05, ((seed % 7) - 3) * 0.01);

  for (const [b, lvl] of [[full, 0], [far, 1]] as const) {
    const body = latheM(profile, lvl ? 10 : 24, 1.6);
    weather(body, straw, { ground: 0, splash: 0.7, strength: 0.35, top: 2.4, topStrength: 0.25, seed });
    // Sun-bleached cap, damp dark foot, a few vertical streaks where rain runs off.
    shade(body, (x, y, z) => (y > 1.6 ? 1.08 : 1) * (0.9 + 0.1 * Math.abs(Math.sin(Math.atan2(z, x) * 7 + seed))));
    b.add('thatch', body);
  }
  // The centre pole and straw ropes round the cap.
  full.add('wood', rod(new Vector3(0, 2.2, 0), new Vector3(0.03, 2.75, 0.02), 0.035, 5, false), '#5e4630');
  for (const [y, r] of [[1.78, 1.18], [2.08, 0.72]] as const) full.add('thatch', new TorusGeometry(r, 0.035, 4, 24).rotateX(Math.PI / 2).translate(0, y, 0), '#8a7244');
  // Loose straw scattered round the foot.
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2 + (seed % 10) * 0.1;
    const heap = mound(0.35 + (k % 3) * 0.08, 0.14, seed + k, 1, 0.3);
    heap.translate(Math.cos(ang) * 1.42, 0, Math.sin(ang) * 1.42);
    full.add('thatch', weather(heap, straw.clone().multiplyScalar(0.92), { ground: 0, strength: 0.2, seed: seed + k }));
  }

  const f0 = full.build(a.kit, { name: `haystack:${l.id}`, cast: true });
  const f1 = far.build(a.kit, { name: `haystack:${l.id}:far`, cast: true });
  root.add(lodOf([[f0, 0], [f1, 40]], 130));
  a.root.add(root);
}

// ---- Scarecrow ----------------------------------------------------------------------------------

/**
 * The bujgavna in the field: a bamboo cross, an old kurta and dhoti, a pot for a head with a
 * lime-painted face, and a strip of red cloth tied to one arm. Collider: its 12 cm pole.
 */
export function scarecrow(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:scarecrow:${l.id}`, l.x, l.z, l.rot);
  const full = new Batch();
  const seed = hashId(l.id);
  const cane = '#a88e58';

  // Pole and cross-arm.
  full.add('paint', rod(new Vector3(0, 0, 0), new Vector3(0.02, 1.95, 0), 0.035, 6, false), cane);
  full.add('paint', rod(new Vector3(-0.72, 1.42, 0.02), new Vector3(0.74, 1.46, 0), 0.025, 6, false), cane);
  // Kurta: a torso, sleeves along the arm, faded indigo.
  const kurta = '#5d6e8c';
  full.add('fabric', weather(box('fabric', 0.5, 0.62, 0.22, 0, 1.2, 0), kurta, { ground: 0.9, splash: 0.3, strength: 0.25, seed }));
  for (const sx of [-1, 1]) full.add('fabric', weather(box('fabric', 0.42, 0.16, 0.16, sx * 0.44, 1.44, 0.01), kurta, { ground: 1.3, strength: 0.15, seed }));
  // Dhoti, a little torn at the hem.
  full.add('fabric', weather(new CylinderGeometry(0.24, 0.3, 0.46, 8, 2, true).translate(0, 0.66, 0), '#d8cfb8', { ground: 0.4, splash: 0.3, strength: 0.35, seed }));
  // Head: an upturned matka with a lime face, charcoal eyes and moustache.
  pot(full, MATKA, at(0, 2.22, 0, 0, 0.8, Math.PI), '#9c4a2a', seed, false);
  full.add('paint', fill(new CylinderGeometry(0.09, 0.09, 0.01, 12).rotateX(Math.PI / 2).translate(0, 2.06, 0.172), '#e8e1d0'));
  for (const sx of [-1, 1]) full.add('paint', new IcosahedronGeometry(0.022, 0).translate(sx * 0.04, 2.085, 0.18), '#1e1a16');
  full.add('paint', box('paint', 0.1, 0.016, 0.012, 0, 2.035, 0.18), '#1e1a16');
  // Straw sticking out of the cuffs and collar, and a red rag on the right arm.
  for (const [x, y] of [[-0.68, 1.44], [0.7, 1.46], [0, 1.52]] as const) {
    const tuft = mound(0.07, 0.09, seed + x * 10, 1, 0.4);
    full.add('thatch', fill(tuft.translate(x, y - 0.04, 0), TONE.thatch));
  }
  full.add('fabric', fill(box('fabric', 0.06, 0.34, 0.01, 0.62, 1.28, 0.03), TONE.vermilion));

  const f0 = full.build(a.kit, { name: `scarecrow:${l.id}`, cast: true, noShadow: ['paint'] });
  root.add(lodOf([[f0, 0]], 80));
  a.root.add(root);
}

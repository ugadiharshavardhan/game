/**
 * Walls, fences and the village's landmarks — everything between the houses you walk past.
 *
 *   props.ts         compound and garden walls, bamboo field fences, tulsi vrindavans; dispatch
 *   props.water.ts   the wells, the stepped village tank, the handpump
 *   props.stalls.ts  the flower, potter's, fruit and puja stalls
 *   props.farm.ts    the bullock cart, haystacks, the scarecrow
 *   props.parts.ts   shared parts (pots, sacks, marigolds, garlands, fruit, cloth) and plumbing
 *
 * Every feature is built in its own frame at its layout position and turned like its collider,
 * with a full level of detail near the player and a cheap silhouette (or nothing) beyond.
 * Offerings are the festival module's: the spots in front of the stalls are left clear.
 */
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import type { LandmarkDef, P2, WallDef } from '../../types';
import { LEAF_QUAD, rng } from './canvasTextures';
import { Batch, box, fill, slab, weather } from './geom';
import { TONE, WALL_PAINT } from './palette';
import { at, diya, featureRoot, framer, garland, hashId, lodOf, Merge, rod, bamboo } from './props.parts';
import { cart, haystack, scarecrow } from './props.farm';
import { flowerStall, fruitStall, potter, pujaStall } from './props.stalls';
import { handpump, tank, well } from './props.water';
import type { ArtContext } from './runtime';

export function build(a: ArtContext): boolean {
  for (const w of a.layout.walls) if (w.kind !== 'temple') wall(a, w);
  fences(a);
  for (const l of a.layout.landmarks) {
    switch (l.kind) {
      case 'well':
        well(a, l);
        break;
      case 'pond':
        tank(a, l);
        break;
      case 'handpump':
        handpump(a, l);
        break;
      case 'tulsi':
        tulsi(a, l);
        break;
      case 'flower-stall':
        flowerStall(a, l);
        break;
      case 'potter':
        potter(a, l);
        break;
      case 'fruit-stall':
        fruitStall(a, l);
        break;
      case 'puja-stall':
        pujaStall(a, l);
        break;
      case 'cart':
        cart(a, l);
        break;
      case 'haystack':
        haystack(a, l);
        break;
      case 'scarecrow':
        scarecrow(a, l);
        break;
      default:
        break; // pandal, banyan platform, temple landmarks: other modules
    }
  }
  return true;
}

// ---- Walls ------------------------------------------------------------------------------------

/**
 * A wall along its polyline, segment by segment, exactly on its colliders (thickness × height,
 * each segment running half a thickness past its ends so corners close). Compound walls are
 * lime-washed brick with a geru dado and a cement coping, broken by pilasters; the tulsi garden's
 * is dry rubble pointed with lime under a rounded mud-lime coping. Gate posts stand at open ends.
 */
function wall(a: ArtContext, w: WallDef): void {
  const b = new Batch();
  const pts = w.points;
  const t = w.thickness;
  const h = w.height;
  const garden = w.kind === 'garden';
  const seed = hashId(w.id);
  const paint = new Color(w.id.startsWith('home') ? WALL_PAINT.limewhite : '#ddd3c0');
  const flames: Vector3[] = [];

  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const rot = Math.atan2(q.x - p.x, q.z - p.z);
    // Along-segment extent, from p: the first segment reaches back past its start; the others
    // start half a thickness in, so corner blocks never overlap (no z-fighting on the coping).
    const s0 = i === 0 ? -t / 2 : t / 2;
    const s1 = len + t / 2;
    const L = s1 - s0;
    const c = (s0 + s1) / 2;
    const m = at(p.x + Math.sin(rot) * c, 0, p.z + Math.cos(rot) * c, rot);
    const lift = i * 0.002;
    if (garden) {
      b.add('rubble', weather(slab('rubble', t, h - 0.1, L, 0, (h - 0.1) / 2, 0, 3), '#b5a891', { ground: 0, splash: 0.6, strength: 0.35, seed: seed + i }), m);
      // Rounded lime coping: a flat cap and a narrower crown.
      b.add('plaster', weather(box('plaster', t + 0.05, 0.07, L + 0.02, 0, h - 0.065, 0), '#d6cdb8', { ground: h - 0.1, strength: 0.2, seed }), at(0, lift, 0).premultiply(m));
      b.add('plaster', weather(box('plaster', t - 0.1, 0.05, L, 0, h - 0.01, 0), '#cfc5ae', { ground: 0, strength: 0 }), at(0, lift, 0).premultiply(m));
    } else {
      b.add('plaster', weather(slab('plaster', t, h - 0.08, L, 0, (h - 0.08) / 2, 0, 3), paint, { ground: 0, splash: 0.9, strength: 0.3, seed: seed + i }), m);
      b.add('plaster', weather(slab('plaster', t + 0.02, 0.42, L + (i === 0 ? 0.02 : 0), 0, 0.21, 0, 2), '#9a4a35', { ground: 0, splash: 0.4, strength: 0.25, seed }), at(0, lift, 0).premultiply(m));
      b.add('stone', weather(box('stone', t + 0.08, 0.08, L + 0.04, 0, h - 0.04, 0), TONE.cement, { ground: 0, strength: 0 }), at(0, lift, 0).premultiply(m));
      // Pilasters every ~2.6 m.
      const n = Math.floor(L / 2.6);
      for (let k = 1; k <= n; k++) {
        const z = -L / 2 + (L / (n + 1)) * k;
        b.add('plaster', weather(box('plaster', t + 0.1, h - 0.1, 0.3, 0, (h - 0.1) / 2, z), paint, { ground: 0, splash: 0.9, strength: 0.3, seed }), m);
        b.add('stone', fill(box('stone', t + 0.14, 0.06, 0.36, 0, h + 0.02, z), TONE.cement), m);
      }
    }
  }

  // Gate posts where the wall stops: square piers with a stepped cap and a finial.
  const ends: [P2, P2][] = [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]];
  for (const [e, n] of ends) {
    const len = Math.hypot(n.x - e.x, n.z - e.z);
    const ux = (n.x - e.x) / len;
    const uz = (n.z - e.z) / len;
    // Centre the post so its outer face is 5 cm past the collider's end.
    const px = e.x + ux * (0.25 - t / 2 - 0.05);
    const pz = e.z + uz * (0.25 - t / 2 - 0.05);
    const rot = Math.atan2(ux, uz);
    const m = at(px, 0, pz, rot);
    const ph = h + 0.3;
    const col = garden ? '#e2dac8' : paint;
    b.add('plaster', weather(slab('plaster', 0.5, ph, 0.5, 0, ph / 2, 0, 3), col, { ground: 0, splash: 0.8, strength: 0.32, seed: seed + 9 }), m);
    if (!garden) b.add('plaster', weather(box('plaster', 0.52, 0.42, 0.52, 0, 0.21, 0), '#9a4a35', { ground: 0, splash: 0.4, strength: 0.25 }), m);
    b.add('stone', fill(box('stone', 0.6, 0.07, 0.6, 0, ph + 0.035, 0), TONE.cement), m);
    b.add('stone', fill(box('stone', 0.46, 0.06, 0.46, 0, ph + 0.1, 0), TONE.cement), m);
    // A little pot finial with a lit diya beside it for the festival.
    b.add('plaster', fill(new ConeGeometry(0.16, 0.2, 4).rotateY(Math.PI / 4).translate(0, ph + 0.23, 0), col), m);
    b.add('paint', fill(new IcosahedronGeometry(0.06, 1).translate(0, ph + 0.37, 0), '#a8583a'), m);
    diya(b, at(0.14, ph + 0.13, 0.14).premultiply(m));
    flames.push(new Vector3(0.14, ph + 0.17, 0.14).applyMatrix4(m));
  }

  const g = b.build(a.kit, { name: `wall:${w.id}`, cast: true, noShadow: ['paint'] });
  a.root.add(g);
  for (const f of flames) a.flames.add(f);
}

// ---- Bamboo fences ------------------------------------------------------------------------------

/**
 * Field fences of dried bamboo: posts every ~1.5 m, two rails, and a lattice of thin split canes
 * crossing between them — all within the collider's 12 cm.
 */
function fences(a: ArtContext): void {
  const b = new Batch();
  const cane = '#b49b63';
  for (const f of a.layout.fences) {
    if (f.kind !== 'bamboo') continue;
    const seed = hashId(f.id);
    for (let i = 0; i + 1 < f.points.length; i++) {
      const p = f.points[i];
      const q = f.points[i + 1];
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      const n = Math.max(1, Math.round(len / 1.5));
      const P = (t: number, y: number, off = 0) => {
        const x = p.x + (q.x - p.x) * t;
        const z = p.z + (q.z - p.z) * t;
        // Offset across the line (for canes on alternate faces of the posts).
        const nx = -(q.z - p.z) / len;
        const nz = (q.x - p.x) / len;
        return new Vector3(x + nx * off, y, z + nz * off);
      };
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const lean = (((seed + k) % 5) - 2) * 0.008;
        bamboo(b, P(t, 0, 0), P(t, 1.12 + ((k * 7) % 3) * 0.03, lean), 0.042, cane, seed + k);
      }
      for (const y of [0.42, 0.98]) bamboo(b, P(0, y, 0.045), P(1, y + 0.02, 0.045), 0.026, cane, seed + y * 10);
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        b.add('paint', rod(P(t0, 0.12, -0.04), P(t1, 1.05, -0.04), 0.012, 4), new Color(cane).multiplyScalar(0.9));
        b.add('paint', rod(P(t1, 0.12, -0.04), P(t0, 1.05, -0.04), 0.012, 4), new Color(cane).multiplyScalar(0.85));
        // Coir ties at the rail crossings.
        for (const y of [0.42, 0.98]) {
          const c = P(t0, y, 0);
          b.add('paint', new BoxGeometry(0.1, 0.04, 0.07), at(c.x, y, c.z, Math.atan2(q.x - p.x, q.z - p.z)), '#6e5a3a');
        }
      }
    }
  }
  if (!b.empty) a.root.add(b.build(a.kit, { name: 'fences:bamboo', cast: false }));
}

// ---- Tulsi vrindavan ----------------------------------------------------------------------------

/**
 * The tulsi vrindavan: a painted masonry planter on a stepped base, corner horns on its crown, a
 * diya niche on the front face, and the holy basil growing from the top. The painted faces are a
 * canvas texture: lime-white panels, geru borders, lotus medallions, the soot-marked niche.
 */
function tulsi(a: ArtContext, l: LandmarkDef): void {
  const root = featureRoot(`landmark:tulsi:${l.id}`, l.x, l.z, l.rot);
  const w = framer(l.x, l.z, l.rot);
  const b = new Batch();
  const painted = new Merge();
  const seed = hashId(l.id);

  // Stepped base.
  b.add('plaster', weather(box('plaster', 0.95, 0.08, 0.95, 0, 0.04, 0), '#bdb5a5', { ground: 0, splash: 0.1, strength: 0.4 }));
  b.add('plaster', weather(box('plaster', 0.88, 0.08, 0.88, 0, 0.12, 0), '#9a4a35', { ground: 0, splash: 0.2, strength: 0.3 }));
  // Body, with the painted panels on its four faces.
  const bodyY0 = 0.16;
  const bodyY1 = 0.78;
  const bh = bodyY1 - bodyY0;
  b.add('plaster', weather(box('plaster', 0.76, bh, 0.76, 0, bodyY0 + bh / 2, 0), '#e8dcc4', { ground: bodyY0, splash: 0.3, strength: 0.2 }));
  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    const face = new PlaneGeometry(0.6, bh - 0.06);
    // UVs: the front (k = 0) takes the niche panel (left half of the texture), the others the lotus.
    const uv = face.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (k === 0 ? 0 : 0.5));
    face.translate(0, bodyY0 + bh / 2, 0.382).rotateY(yaw);
    painted.add(weather(face, '#ffffff', { ground: bodyY0, splash: 0.25, strength: 0.25, seed }));
  }
  // Corner pilasters in geru, cornice, crown with its soil bed.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('plaster', weather(box('plaster', 0.09, bh, 0.09, sx * 0.37, bodyY0 + bh / 2, sz * 0.37), '#a4503a', { ground: bodyY0, splash: 0.3, strength: 0.25 }));
  b.add('plaster', fill(box('plaster', 0.88, 0.05, 0.88, 0, bodyY1 + 0.025, 0), '#ece4d2'));
  b.add('plaster', fill(box('plaster', 0.8, 0.06, 0.8, 0, bodyY1 + 0.08, 0), '#c9763a'));
  const rimY = bodyY1 + 0.11;
  for (const [sx, sz, cx, cz] of [[0.72, 0.08, 0, 0.32], [0.72, 0.08, 0, -0.32], [0.08, 0.56, 0.32, 0], [0.08, 0.56, -0.32, 0]] as const) {
    b.add('plaster', fill(box('plaster', sx, 0.1, sz, cx, rimY + 0.05, cz), '#ece4d2'));
  }
  b.add('paint', fill(box('paint', 0.58, 0.02, 0.58, 0, rimY + 0.07, 0), '#3b2a1e'));
  // Corner horns (shinga): little stepped cones in red and white.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add('plaster', fill(new CylinderGeometry(0.05, 0.06, 0.05, 8).translate(sx * 0.33, rimY + 0.125, sz * 0.33), '#ece4d2'));
    b.add('paint', fill(new ConeGeometry(0.045, 0.15, 8).translate(sx * 0.33, rimY + 0.225, sz * 0.33), '#b8442e'));
  }
  // The diya niche's ledge and its diya.
  b.add('plaster', fill(box('plaster', 0.2, 0.025, 0.06, 0, bodyY0 + 0.16, 0.41), '#d8ccb4'));
  diya(b, at(0, bodyY0 + 0.1725, 0.41, 0, 0.9));
  a.flames.add(w(0, bodyY0 + 0.2, 0.41), 1);
  // A marigold garland around the cornice, and kumkum-haldi dots on the front.
  const ring: Vector3[] = [];
  for (let k = 0; k <= 36; k++) {
    const ang = (k / 36) * Math.PI * 2;
    const rr = 0.47 / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
    ring.push(new Vector3(Math.cos(ang) * Math.min(rr, 0.62), bodyY1 + 0.02 - 0.05 * Math.abs(Math.sin(ang * 2)), Math.sin(ang) * Math.min(rr, 0.62)));
  }
  garland(b, ring, { bead: 0.028 });
  for (const [dx, c] of [[-0.05, TONE.sindoor], [0.05, TONE.turmeric]] as const) b.add('paint', new CylinderGeometry(0.018, 0.018, 0.004, 8).rotateX(Math.PI / 2).translate(dx, bodyY1 - 0.08, 0.385), c);

  // The tulsi itself: woody purple-green stems, crossed leaf cards, flower spikes (manjiri).
  const soil = rimY + 0.08;
  const leaves = new Batch();
  const [u0, v0] = LEAF_QUAD.neem;
  for (let k = 0; k < 5; k++) {
    const yaw = (k / 5) * Math.PI + 0.3;
    const hgt = 0.5 + (k % 2) * 0.1;
    const card = new PlaneGeometry(0.46, hgt);
    const uv = card.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
    card.translate(0, soil + hgt / 2 + 0.02, 0).rotateY(yaw);
    leaves.add('foliage', fill(card, k % 2 ? '#7f9a5c' : '#6f7e55'));
  }
  const cap = new PlaneGeometry(0.5, 0.5);
  const cuv = cap.getAttribute('uv');
  for (let i = 0; i < cuv.count; i++) cuv.setXY(i, u0 + cuv.getX(i) * 0.5, v0 + cuv.getY(i) * 0.5);
  leaves.add('foliage', fill(cap.rotateX(-Math.PI / 2).translate(0, soil + 0.42, 0), '#809c5e'));
  const r = rng(seed);
  for (let k = 0; k < 9; k++) {
    const ang = r() * Math.PI * 2;
    const rr = 0.04 + r() * 0.08;
    const top = new Vector3(Math.cos(ang) * (rr + 0.12), soil + 0.3 + r() * 0.28, Math.sin(ang) * (rr + 0.12));
    b.add('paint', rod(new Vector3(Math.cos(ang) * rr * 0.4, soil, Math.sin(ang) * rr * 0.4), top, 0.008, 4), '#5a4038');
    b.add('paint', new CylinderGeometry(0.004, 0.009, 0.09, 4).translate(top.x, top.y + 0.05, top.z), '#7a5a7a');
  }

  const full = b.build(a.kit, { name: `tulsi:${l.id}`, cast: true, noShadow: ['paint'] });
  const pm = painted.build(tulsiMaterial(a), `tulsi:${l.id}:painted`);
  if (pm) full.add(pm);
  full.add(leaves.build(a.kit, { name: `tulsi:${l.id}:leaves`, cast: false }));
  root.add(lodOf([[full, 0]], 70));
  a.root.add(root);
}

function tulsiMaterial(a: ArtContext): MeshStandardMaterial {
  const tex = a.bank.canvas('props:tulsi-faces', [1024, 512], (g, W, H) => {
    const w = W / 2;
    for (const panel of [0, 1]) {
      const x0 = panel * w;
      g.fillStyle = '#efe5cf';
      g.fillRect(x0, 0, w, H);
      // Geru border with a band of white dots.
      g.strokeStyle = '#a84a32';
      g.lineWidth = 34;
      g.strokeRect(x0 + 17, 17, w - 34, H - 34);
      g.fillStyle = '#f7f1e2';
      for (let k = 0; k < 18; k++) {
        const t = k / 18;
        for (const [px, py] of [[x0 + 17 + t * (w - 34), 17], [x0 + 17 + t * (w - 34), H - 17], [x0 + 17, 17 + t * (H - 34)], [x0 + w - 17, 17 + t * (H - 34)]]) {
          g.beginPath();
          g.arc(px, py, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = '#d99a3a';
      g.lineWidth = 6;
      g.strokeRect(x0 + 44, 44, w - 88, H - 88);
      const cx = x0 + w / 2;
      if (panel === 0) {
        // The diya niche: an arched recess, soot-darkened above the flame.
        const soot = g.createRadialGradient(cx, H * 0.4, 10, cx, H * 0.34, 150);
        soot.addColorStop(0, 'rgba(30,20,14,0.55)');
        soot.addColorStop(1, 'rgba(30,20,14,0)');
        g.fillStyle = soot;
        g.fillRect(x0 + 50, 50, w - 100, H - 100);
        g.beginPath();
        g.moveTo(cx - 62, H * 0.78);
        g.lineTo(cx - 62, H * 0.46);
        g.quadraticCurveTo(cx - 62, H * 0.28, cx, H * 0.22);
        g.quadraticCurveTo(cx + 62, H * 0.28, cx + 62, H * 0.46);
        g.lineTo(cx + 62, H * 0.78);
        g.closePath();
        g.fillStyle = '#2a1c14';
        g.fill();
        g.strokeStyle = '#c9763a';
        g.lineWidth = 10;
        g.stroke();
        // Little lotus bud on the arch's point.
        petals(g, cx, H * 0.17, 5, 26, 12, '#c8321e');
      } else {
        // A lotus medallion with a ring of petals and dots.
        g.beginPath();
        g.arc(cx, H / 2, 128, 0, Math.PI * 2);
        g.fillStyle = '#c9763a';
        g.fill();
        g.beginPath();
        g.arc(cx, H / 2, 116, 0, Math.PI * 2);
        g.fillStyle = '#f2e8d0';
        g.fill();
        petals(g, cx, H / 2, 12, 96, 26, '#b8442e');
        petals(g, cx, H / 2, 8, 62, 20, '#e0a52a');
        g.beginPath();
        g.arc(cx, H / 2, 20, 0, Math.PI * 2);
        g.fillStyle = '#3f7a3a';
        g.fill();
        for (const [dx, dy] of [[-150, -150], [150, -150], [-150, 150], [150, 150]]) petals(g, cx + dx * 0.95, H / 2 + dy * 0.95, 6, 28, 12, '#3f7a3a');
      }
    }
    // Lime-wash grain.
    const r = rng(77);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(90,70,50,${r() * 0.06})`;
      g.fillRect(r() * W, r() * H, 2 + r() * 20, 1 + r() * 2);
    }
  }, true, false);
  return a.kit.custom('props:tulsi', () => new MeshStandardMaterial({ map: tex, roughness: 0.9, vertexColors: true }));
}

function petals(g: CanvasRenderingContext2D, cx: number, cy: number, n: number, len: number, wid: number, fill: string): void {
  for (let i = 0; i < n; i++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((i / n) * Math.PI * 2);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(wid, len * 0.5, 0, len);
    g.quadraticCurveTo(-wid, len * 0.5, 0, 0);
    g.fillStyle = fill;
    g.fill();
    g.restore();
  }
}

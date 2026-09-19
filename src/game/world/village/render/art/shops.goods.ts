/**
 * What the shops sell, and the counters they sell it over.
 *
 * Ganesh Kirana: a planked counter with a row of plastic-lidded jars and a brass pan balance;
 * floor-to-ceiling shelves of oil tins, pulses in jars, tea and soap, bottles and cartons; strips
 * of sachets hanging from a rod behind the lintel; open gunny sacks of grain at the counter.
 *
 * Laxmi Mithai: a glass showcase of steel trays — ukadiche modak, motichoor laddoo, jalebi, kaju
 * barfi, peda — with a parat piled with modak on top for Chaturthi; behind it a big iron kadhai of
 * jalebi frying on a brick chulha, steel racks of vessels and sweet boxes, and the shop's own
 * little puja shelf with a brass samai.
 *
 * Everything here is built in the shop's local frame (see ShopFrame in shops.ts).
 */
import { BoxGeometry, Color, CylinderGeometry, IcosahedronGeometry, LatheGeometry, type Matrix4, PlaneGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { type Batch, box, boxUV, fill, weather } from './geom';
import { TONE } from './palette';
import { at, basket, garland, GRAIN, HANDI, latheM, LOTA, marigoldHeap, type Merge, mosaic, pot, rod, sack, shade } from './props.parts';
import type { ShopFrame } from './shops';

/** Flames and lamp anchors collected in the shop's local frame; shops.ts registers them. */
export interface Lights {
  flames: [Vector3, number][];
  lamps: [Vector3, number, string, number][];
}

type Rand = () => number;
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

// ---- Ganesh Kirana ------------------------------------------------------------------------------

export function kiranaFront(b: Batch, glass: Merge, f: ShopFrame, r: Rand, lights: Lights): void {
  const { cx, cz0, cz1, ch, floor, ox, backZ, hd, openTop } = f;
  const cd = cz1 - cz0;
  const cm = (cz0 + cz1) / 2;

  // ---- counter: planked, painted a faded green, a teak top worn by elbows ----------------------
  b.add('wood', weather(box('wood', 2 * cx - 0.04, ch - 0.06, cd - 0.04, 0, (ch - 0.06) / 2, cm - 0.01), '#93a393', { ground: 0, splash: 0.45, strength: 0.35 }));
  b.add('teak', weather(box('teak', 2 * cx + 0.02, 0.06, cd + 0.02, 0, ch - 0.03, cm), '#8f6644', { ground: 0, strength: 0 }));
  const fz = cz1 - 0.012;
  for (const y of [0.1, ch - 0.14]) b.add('teak', fill(box('teak', 2 * cx - 0.04, 0.07, 0.025, 0, y, fz), '#6e5a42'));
  const bays = 7;
  for (let i = 0; i <= bays; i++) b.add('teak', fill(box('teak', 0.06, ch - 0.24, 0.025, -cx + 0.05 + ((2 * cx - 0.1) * i) / bays, ch / 2 - 0.02, fz), '#6e5a42'));

  // Jars of toffee and biscuits along the front edge (glass, with the contents showing through).
  const candy = [
    ['#d23a2a', '#f2c230', '#2f7ac0', '#3aa04a', '#f2efe6'],
    ['#d9a95a', '#c48a3a', '#e6c07a'],
    ['#f2efe6', '#e05a6a'],
    ['#5a3a22', '#e0b040', '#7a4a2a'],
    ['#9ab04a', '#e8e0c0', '#c8d890'],
    ['#e8862a', '#f2c230'],
  ] as const;
  const lids = ['#c8321e', '#c8321e', '#2f5f9a', '#e0a52a', '#3a8a4a'];
  for (let i = 0; i < 7; i++) {
    const x = -cx + 0.3 + i * 0.29;
    jar(b, glass, x, ch, cz1 - 0.17, 0.085, 0.26, pick(r, candy), lids[i % lids.length], 0.45 + r() * 0.45, i);
  }
  // The pan balance, its weights, and the account book.
  balance(b, 1.2, ch, cm - 0.06);
  for (const [k, rr, h] of [[0, 0.05, 0.035], [1, 0.04, 0.03], [2, 0.03, 0.025], [3, 0.022, 0.02]] as const) {
    b.add('iron', new CylinderGeometry(rr, rr, h, 10).translate(1.72 + (k % 2) * 0.12, ch + h / 2 + (k > 1 ? 0.035 : 0), cm - 0.12 + (k > 1 ? 0 : k * 0.1)));
  }
  b.add('paint', new BoxGeometry(0.24, 0.035, 0.32).rotateY(0.12).translate(2.35, ch + 0.018, cm - 0.05), '#8a1f1a');
  b.add('paint', new BoxGeometry(0.22, 0.026, 0.3).rotateY(0.12).translate(2.35, ch + 0.02, cm - 0.05), '#efe6cf');
  b.add('paint', new CylinderGeometry(0.004, 0.004, 0.14, 4).rotateZ(Math.PI / 2).rotateY(0.5).translate(2.32, ch + 0.042, cm - 0.02), '#1f3f7a');

  // ---- shelves: floor to ceiling on the back wall ------------------------------------------------
  const sdep = 0.36;
  const sz = backZ + sdep / 2;
  const uprights = [-ox + 0.08, -ox / 2, 0, ox / 2, ox - 0.08];
  const boards = [0.06, 0.5, 0.92, 1.32, 1.7, 2.06].map((h) => floor + h);
  for (const x of uprights) b.add('wood', weather(box('wood', 0.045, 2.32, sdep, x, floor + 1.16, sz), '#6e5238', { ground: floor, strength: 0.2 }));
  for (const y of boards) b.add('wood', fill(box('wood', 2 * ox - 0.1, 0.03, sdep, 0, y, sz), '#735a40'));
  for (let bi = 0; bi < uprights.length - 1; bi++) {
    const xa = uprights[bi] + 0.04;
    const xb = uprights[bi + 1] - 0.04;
    boards.forEach((y, row) => shelfRow(b, glass, xa, xb, y + 0.015, backZ + 0.02, sdep - 0.04, row, r, row === boards.length - 1 ? openTop - 0.05 - y : boards[row + 1] - y - 0.05));
  }

  // ---- sachet strips hanging behind the lintel ---------------------------------------------------
  const strips = [
    ['#1f2a44', '#e03a6a'], ['#2f7fc0', '#f2d23a'], ['#c8321e', '#f4efe4'], ['#6a3a1e', '#d9a441'], ['#2e8a4a', '#e8e4d8'],
    ['#7a2d8a', '#f2c6e0'], ['#e8862a', '#2a2a2a'], ['#1f6f8a', '#f4efe4'],
  ] as const;
  const rodY = openTop - 0.1;
  const rodZ = hd - 0.3;
  b.add('iron', new CylinderGeometry(0.01, 0.01, 2 * ox - 0.3, 5).rotateZ(Math.PI / 2).translate(0, rodY, rodZ));
  let si = 0;
  for (let x = -ox + 0.3; x < ox - 0.2; x += 0.27) {
    if (Math.abs(x) < 0.55) continue;
    const [c1, c2] = strips[si++ % strips.length];
    sachetStrip(b, x, rodY - 0.02, rodZ, 6 + Math.floor(r() * 5), c1, c2, r);
  }
  // Tube light under the lintel, lighting the shelves.
  b.add('paint', box('paint', 1.25, 0.04, 0.06, -0.8, openTop - 0.03, hd - 0.4), '#e8e4da');
  b.add('lamplit', new CylinderGeometry(0.018, 0.018, 1.15, 6).rotateZ(Math.PI / 2).translate(-0.8, openTop - 0.07, hd - 0.4));

  // ---- outside: open sacks of grain at the counter, onions and potatoes in baskets ----------------
  const grains = [GRAIN.rice, GRAIN.wheat, GRAIN.toor, GRAIN.jowar];
  [0.45, 0.93].forEach((x, i) => sack(b, at(x, 0, cz1 + 0.15, r() * 6, [1, 1, 1]), grains[i], 11 + i, 0.46, 0.18));
  sack(b, at(-2.45, 0, cz1 + 0.15, r() * 6), GRAIN.masoor, 17, 0.44, 0.18);
  sack(b, at(-2.05, 0, cz1 + 0.13, r() * 6), GRAIN.moong, 19, 0.4, 0.16);
  for (const [x, crop, seed] of [[1.52, GRAIN.onion, 21], [2.0, GRAIN.potato, 23], [2.45, GRAIN.onion, 29]] as const) {
    const h = basket(b, at(x, 0, cz1 + 0.17), 0.19, 0.13, seed);
    b.add('paint', mosaic(new IcosahedronGeometry(1, 2).scale(0.17, 0.08, 0.17).translate(x, h, cz1 + 0.17), crop, seed, 0.12));
  }
  // Scoops left in the grain.
  b.add('brass', new LatheGeometry([[0.001, 0], [0.05, 0.005], [0.06, 0.05], [0.001, 0.05]].map(([a, c]) => new Vector2(a, c)), 8).rotateX(0.9).translate(0.45, 0.46, cz1 + 0.18));

  // ---- the bare bulb under the awning, and strings of chips packets on the posts -----------------
  const bx = 0.35;
  const bz = 3.55 + (hd - 2.65);
  const top = f.awningAt(bz) - 0.03;
  b.add('paint', rod(new Vector3(bx, top, bz), new Vector3(bx, 2.43, bz), 0.004, 4), '#222');
  b.add('paint', new CylinderGeometry(0.018, 0.022, 0.05, 8).translate(bx, 2.41, bz), '#2a2a2a');
  b.add('lamplit', new IcosahedronGeometry(0.042, 1).scale(1, 1.25, 1).translate(bx, 2.35, bz));
  lights.lamps.push([new Vector3(bx, 2.25, bz), 2.6, '#ffb466', 8]);
  for (const px of f.poleXs) {
    const x = px + (px < 0 ? 0.28 : -0.28);
    const chips = ['#f2c230', '#2f7ac0', '#3aa04a', '#d23a2a', '#e8862a'];
    b.add('paint', rod(new Vector3(x, f.poleH + 0.03, f.poleZ), new Vector3(x, 1.72, f.poleZ), 0.004, 3), '#ddd');
    for (let k = 0; k < 5; k++) {
      const g = new IcosahedronGeometry(1, 1).scale(0.07, 0.1, 0.028).rotateY((r() - 0.5) * 0.8);
      b.add('paint', g.translate(x, f.poleH - 0.1 - k * 0.13, f.poleZ + 0.02), chips[(k + (px < 0 ? 0 : 2)) % chips.length]);
    }
  }
}

function jar(b: Batch, glass: Merge, x: number, y: number, z: number, rr: number, h: number, contents: readonly string[], lid: string, level: number, seed: number): void {
  glass.add(latheM([[0.001, 0], [rr, 0], [rr, h * 0.86], [rr * 0.82, h * 0.93], [rr * 0.78, h]], 8, 1).translate(x, y, z));
  const ch = h * 0.86 * level;
  b.add('paint', mosaic(new CylinderGeometry(rr * 0.93, rr * 0.93, ch, 8, 2).translate(x, y + ch / 2 + 0.004, z), contents, seed, 0.1));
  b.add('paint', new CylinderGeometry(rr * 0.84, rr * 0.84, 0.045, 8).translate(x, y + h + 0.022, z), lid);
}

/** A tarazu: iron post and beam, two brass pans on chains. */
function balance(b: Batch, x: number, y: number, z: number): void {
  b.add('iron', new BoxGeometry(0.2, 0.03, 0.12).translate(x, y + 0.015, z));
  b.add('iron', rod(new Vector3(x, y, z), new Vector3(x, y + 0.5, z), 0.012, 6));
  b.add('iron', new BoxGeometry(0.58, 0.022, 0.022).translate(x, y + 0.5, z));
  b.add('brass', new BoxGeometry(0.012, 0.09, 0.01).translate(x, y + 0.56, z));
  for (const sx of [-1, 1]) {
    const px = x + sx * 0.28;
    const panY = y + 0.08;
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2;
      b.add('iron', rod(new Vector3(px, y + 0.5, z), new Vector3(px + Math.cos(ang) * 0.1, panY + 0.025, z + Math.sin(ang) * 0.1), 0.0025, 3));
    }
    b.add('brass', new LatheGeometry([[0.001, 0], [0.07, 0.004], [0.11, 0.02], [0.12, 0.03], [0.1, 0.022], [0.001, 0.01]].map(([a, c]) => new Vector2(a, c)), 14).translate(px, panY, z));
  }
}

/** A strip of shampoo / tea / detergent sachets, zig-zagging slightly as they hang. */
function sachetStrip(b: Batch, x: number, y: number, z: number, n: number, c1: string, c2: string, r: Rand): void {
  const h = 0.085;
  const yaw = (r() - 0.5) * 0.5;
  for (let k = 0; k < n; k++) {
    const tilt = (k % 2 ? 1 : -1) * 0.06;
    const m = at(x, y - h / 2 - k * h, z, yaw, 1, tilt);
    b.add('paint', new BoxGeometry(0.068, h - 0.004, 0.006), m, c1);
    b.add('paint', new BoxGeometry(0.05, 0.022, 0.008).translate(0, 0.012, 0), m, c2);
  }
}

/** One shelf's worth of stock between two uprights. `row` picks what the shelf holds. */
function shelfRow(b: Batch, glass: Merge, xa: number, xb: number, y: number, z0: number, depth: number, row: number, r: Rand, clear: number): void {
  const zf = z0 + depth * 0.62;
  let x = xa;
  const put = (w: number, fn: (cx: number) => void) => {
    if (x + w > xb) return false;
    fn(x + w / 2);
    x += w + 0.01 + r() * 0.02;
    return true;
  };
  const labels = ['#d8b23a', '#c8321e', '#3a7a3a', '#2f5f9a', '#e8862a', '#7a2d8a'];
  const guard = 60;
  for (let i = 0; i < guard && x < xb - 0.05; i++) {
    let ok = true;
    if (row === 0) {
      // Square oil tins and blue plastic drums.
      if (r() < 0.7) {
        const lab = pick(r, labels);
        ok = put(0.23, (cx) => {
          b.add('paint', weather(box('paint', 0.22, 0.31, 0.22, cx, y + 0.155, zf - 0.04), '#a9adaf', { ground: y, splash: 0.1, strength: 0.2 }));
          b.add('paint', box('paint', 0.225, 0.12, 0.225, cx, y + 0.17, zf - 0.04), lab);
          b.add('paint', new CylinderGeometry(0.025, 0.025, 0.03, 8).translate(cx + 0.05, y + 0.325, zf - 0.04), '#c8a030');
        });
      } else {
        ok = put(0.25, (cx) => b.add('paint', new CylinderGeometry(0.12, 0.115, 0.3, 12).translate(cx, y + 0.15, zf - 0.04), '#2f5f8f'));
      }
    } else if (row === 1) {
      // Pulses in glass jars.
      const g = pick(r, [GRAIN.toor, GRAIN.masoor, GRAIN.moong, GRAIN.rice, GRAIN.wheat, GRAIN.sugar]);
      ok = put(0.15, (cx) => jar(b, glass, cx, y, zf, 0.068, 0.24, g, pick(r, ['#c8321e', '#e8e4d8', '#2f5f9a']), 0.6 + r() * 0.35, Math.floor(cx * 100)));
    } else if (row === 2) {
      // Tea packets standing in threes, soap cakes in stacks.
      const c = pick(r, labels);
      if (r() < 0.6) {
        ok = put(0.28, (cx) => {
          for (let k = 0; k < 3; k++) {
            b.add('paint', box('paint', 0.085, 0.14, 0.05, cx - 0.09 + k * 0.09, y + 0.07, zf), c);
            b.add('paint', box('paint', 0.087, 0.035, 0.052, cx - 0.09 + k * 0.09, y + 0.1, zf), '#f2ede0');
          }
        });
      } else {
        ok = put(0.12, (cx) => {
          const n = 3 + Math.floor(r() * 4);
          for (let k = 0; k < n; k++) b.add('paint', box('paint', 0.1, 0.034, 0.065, cx, y + 0.017 + k * 0.035, zf), k % 2 ? c : new Color(c).offsetHSL(0, 0, 0.12));
        });
      }
    } else if (row === 3) {
      // Bottles: coconut oil, mustard oil, phenyl, hair oil.
      const c = pick(r, ['#e8e0c8', '#d9b43a', '#2a3a2a', '#3a6ea8', '#8a2a2a', '#f2efe6']);
      const cap = pick(r, ['#c8321e', '#2f5f9a', '#f2c230', '#2a2a2a']);
      const n = 2 + Math.floor(r() * 3);
      const rr = 0.032 + r() * 0.014;
      const h = 0.15 + r() * 0.1;
      ok = put(n * (rr * 2 + 0.01), (cx) => {
        for (let k = 0; k < n; k++) {
          const bx = cx - ((n - 1) * (rr * 2 + 0.01)) / 2 + k * (rr * 2 + 0.01);
          b.add('paint', new CylinderGeometry(rr, rr, h, 6, 1, true).translate(bx, y + h / 2, zf), c);
          b.add('paint', new CylinderGeometry(rr * 0.4, rr * 0.9, 0.04, 6, 1, true).translate(bx, y + h + 0.02, zf), c);
          b.add('paint', new CylinderGeometry(rr * 0.42, rr * 0.42, 0.025, 6).translate(bx, y + h + 0.052, zf), cap);
          b.add('paint', new CylinderGeometry(rr * 1.02, rr * 1.02, h * 0.4, 6, 1, true).translate(bx, y + h * 0.45, zf), '#f2ede0');
        }
      });
    } else {
      // Cartons, taped; stacked steel dabbas.
      if (r() < 0.75) {
        const w = 0.25 + r() * 0.2;
        const h = Math.min(0.14 + r() * 0.2, clear);
        ok = put(w, (cx) => {
          b.add('paint', weather(box('paint', w, h, depth * 0.9, cx, y + h / 2, z0 + depth * 0.48), '#a47c4c', { ground: y, strength: 0.15 }));
          b.add('paint', box('paint', w + 0.003, 0.03, depth * 0.9 + 0.003, cx, y + h - 0.03, z0 + depth * 0.48), '#6e5234');
          if (row === 4) b.add('paint', box('paint', w * 0.5, h * 0.4, 0.004, cx, y + h * 0.45, z0 + depth * 0.93 + 0.001), pick(r, labels));
        });
      } else {
        ok = put(0.18, (cx) => {
          const n = Math.min(3, Math.floor(clear / 0.09));
          for (let k = 0; k < n; k++) b.add('paint', new CylinderGeometry(0.085 - k * 0.012, 0.085 - k * 0.012, 0.085, 12).translate(cx, y + 0.043 + k * 0.087, zf), '#c3c6c6');
        });
      }
    }
    if (!ok) break;
  }
}

// ---- Laxmi Mithai --------------------------------------------------------------------------------

export function mithaiFront(b: Batch, glass: Merge, f: ShopFrame, r: Rand, lights: Lights): void {
  const { cx, cz0, cz1, ch, floor, ox, backZ, hd, openTop } = f;
  const cd = cz1 - cz0;
  const cm = (cz0 + cz1) / 2;
  const alu = '#c6c9ca';

  // ---- the showcase: teak base, aluminium frame, glass, two tiers of steel trays --------------------
  const baseH = 0.34;
  b.add('wood', weather(box('wood', 2 * cx - 0.02, baseH, cd - 0.02, 0, baseH / 2, cm), '#5c3b25', { ground: 0, splash: 0.3, strength: 0.35 }));
  b.add('brass', new BoxGeometry(2 * cx - 0.02, 0.035, 0.012).translate(0, 0.07, cz1 - 0.005));
  b.add('brass', new BoxGeometry(2 * cx - 0.02, 0.02, 0.012).translate(0, baseH - 0.03, cz1 - 0.005));
  b.add('paint', box('paint', 2 * cx - 0.06, 0.02, cd - 0.06, 0, baseH + 0.01, cm), '#dcd8cc');
  const posts = 6;
  for (let i = 0; i <= posts; i++) {
    const x = -cx + 0.015 + ((2 * cx - 0.03) * i) / posts;
    for (const z of [cz1 - 0.02, cz0 + 0.02]) b.add('paint', box('paint', 0.028, ch - baseH, 0.028, x, (ch + baseH) / 2, z), alu);
  }
  for (const z of [cz1 - 0.02, cz0 + 0.02]) for (const y of [baseH + 0.012, ch - 0.012]) b.add('paint', box('paint', 2 * cx, 0.025, 0.03, 0, y, z), alu);
  for (const sx of [-1, 1]) b.add('paint', box('paint', 0.03, 0.025, cd - 0.04, sx * (cx - 0.015), ch - 0.012, cm), alu);
  glass.add(new PlaneGeometry(2 * cx - 0.02, ch - baseH - 0.02).translate(0, (ch + baseH) / 2, cz1 - 0.012));
  glass.add(new PlaneGeometry(2 * cx - 0.02, cd - 0.04).rotateX(-Math.PI / 2).translate(0, ch - 0.004, cm));
  for (const sx of [-1, 1]) glass.add(new PlaneGeometry(cd - 0.04, ch - baseH - 0.02).rotateY(sx * Math.PI / 2).translate(sx * (cx - 0.01), (ch + baseH) / 2, cm));
  const shelfY = 0.63;
  glass.add(new PlaneGeometry(2 * cx - 0.06, cd - 0.08).rotateX(-Math.PI / 2).translate(0, shelfY, cm));
  b.add('paint', box('paint', 2 * cx - 0.06, 0.012, 0.015, 0, shelfY - 0.006, cz1 - 0.05), alu);

  const kinds: SweetKind[] = ['modak', 'laddoo', 'jalebi', 'kaju', 'peda', 'besan', 'mawaModak', 'pista', 'jamun'];
  const n = 9;
  const pitch = (2 * cx - 0.1) / n;
  for (const [tier, ty] of [[0, baseH + 0.02], [1, shelfY + 0.003]] as const) {
    for (let i = 0; i < n; i++) {
      const x = -cx + 0.05 + pitch * (i + 0.5);
      const kind = kinds[(i + tier * 4) % kinds.length];
      tray(b, x, ty, cz1 - 0.2, pitch - 0.05, 0.3, kind, r);
    }
  }

  // ---- on the counter: a parat of modak for Chaturthi, sweet boxes, the scale ----------------------
  const px = 1.75;
  b.add('paint', new LatheGeometry([[0.001, 0], [0.26, 0], [0.3, 0.035], [0.31, 0.04], [0.28, 0.022], [0.001, 0.015]].map(([a, c]) => new Vector2(a, c)), 20).translate(px, ch, cm), '#c9cccc');
  const layers: [number, number, number][] = [[12, 0.2, 0], [8, 0.12, 0.045], [3, 0.05, 0.09]];
  for (const [count, rad, dy] of layers) {
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2 + dy * 10;
      modak(b, at(px + Math.cos(ang) * rad, ch + 0.018 + dy, cm + Math.sin(ang) * rad, ang, 1.25), '#f1ebdc', k);
    }
  }
  modak(b, at(px, ch + 0.018 + 0.13, cm, 0, 1.25), '#f1ebdc', 99);
  // Sweet boxes, stacked, with a spool of red-and-white string.
  const boxCols = ['#e9a7b4', '#f2ede0', '#e8a04a', '#e9a7b4', '#f2ede0'];
  for (let k = 0; k < 5; k++) {
    b.add('paint', box('paint', 0.24, 0.055, 0.24, 2.75 + (k % 2) * 0.01, ch + 0.028 + k * 0.057, cm - 0.05 + (k % 3) * 0.01), boxCols[k]);
    b.add('paint', box('paint', 0.245, 0.012, 0.245, 2.75 + (k % 2) * 0.01, ch + 0.05 + k * 0.057, cm - 0.05 + (k % 3) * 0.01), '#c9a13a');
  }
  b.add('paint', new CylinderGeometry(0.04, 0.04, 0.06, 10).translate(3.1, ch + 0.03, cm + 0.15), '#c8321e');
  // Electronic scale with its red readout.
  b.add('paint', box('paint', 0.3, 0.07, 0.3, -2.6, ch + 0.035, cm), '#d6d6d2');
  b.add('paint', new CylinderGeometry(0.13, 0.13, 0.012, 16).translate(-2.6, ch + 0.078, cm - 0.02), '#c9cccc');
  b.add('lamplit', box('paint', 0.12, 0.035, 0.005, -2.6, ch + 0.035, cm + 0.152));

  // ---- behind: brick chulha with the big kadhai, jalebi frying ---------------------------------------
  const kx = -ox + 0.62;
  const kz = backZ + 0.62;
  const stoveH = 0.62;
  const stove = weather(box('brick', 0.95, stoveH, 0.72, kx, floor + stoveH / 2, kz), '#8a5a40', { ground: floor, splash: 0.2, strength: 0.2, top: floor + stoveH, topStrength: 0.55 });
  b.add('brick', shade(stove, (_x, y) => (y > floor + stoveH - 0.2 ? 0.55 : 1)));
  b.add('interior', new PlaneGeometry(0.34, 0.24).translate(kx, floor + 0.17, kz + 0.362));
  b.add('lamplit', new PlaneGeometry(0.28, 0.08).translate(kx, floor + 0.08, kz + 0.363));
  lights.flames.push([new Vector3(kx - 0.07, floor + 0.07, kz + 0.37), 1.6], [new Vector3(kx + 0.08, floor + 0.07, kz + 0.37), 1.3]);
  const ky = floor + stoveH - 0.07;
  const kadhai: [number, number][] = [[0.001, 0], [0.18, 0.02], [0.32, 0.08], [0.42, 0.17], [0.44, 0.19], [0.41, 0.175], [0.31, 0.095], [0.17, 0.035], [0.001, 0.015]];
  b.add('iron', new LatheGeometry(kadhai.map(([a, c]) => new Vector2(a, c)), 24).translate(kx, ky, kz));
  for (const sx of [-1, 1]) b.add('iron', new TorusGeometry(0.055, 0.012, 5, 10, Math.PI).rotateY(Math.PI / 2).translate(kx + sx * 0.44, ky + 0.19, kz));
  b.add('paint', new CylinderGeometry(0.36, 0.36, 0.004, 24).translate(kx, ky + 0.13, kz), '#7a4a12');
  for (let k = 0; k < 6; k++) {
    const ang = k * 1.1;
    jalebiCoil(b, at(kx + Math.cos(ang) * 0.2, ky + 0.135, kz + Math.sin(ang) * 0.18, ang), '#e39a2a');
  }
  // The zara (perforated ladle) resting across the rim.
  b.add('iron', rod(new Vector3(kx + 0.25, ky + 0.16, kz + 0.05), new Vector3(kx + 0.75, ky + 0.42, kz + 0.2), 0.01, 5));
  b.add('iron', new CylinderGeometry(0.1, 0.1, 0.01, 12).translate(kx + 0.18, ky + 0.14, kz + 0.02));
  // A vessel of sugar syrup and a tray of finished jalebi by the stove.
  pot(b, HANDI, at(kx + 0.85, floor, kz - 0.05, 0, 1.5), '#b9bcbc', 3, false);
  b.add('paint', new CylinderGeometry(0.2, 0.2, 0.004, 16).translate(kx + 0.85, floor + 0.3, kz - 0.05), '#b8741c');
  // Soot on the side wall above the fire.
  const soot = new PlaneGeometry(1.1, 1.5, 6, 8).rotateY(Math.PI / 2).translate(-ox + 0.004, floor + stoveH + 0.7, kz);
  fill(soot, '#e2d5bf');
  shade(soot, (_x, y, z) => {
    const d = Math.hypot((z - kz) / 0.55, (y - floor - stoveH) / 1.5);
    return 0.25 + 0.75 * Math.min(Math.max(d, 0), 1) ** 1.5;
  });
  b.add('plaster', boxUV(soot, 'plaster'));

  // ---- steel racks on the back wall ------------------------------------------------------------------
  const rx0 = -ox + 1.35;
  const rx1 = ox - 0.1;
  const sdep = 0.4;
  const sz = backZ + sdep / 2;
  const steel = '#b7babb';
  for (const x of [rx0, (rx0 + rx1) / 2, rx1]) for (const z of [backZ + 0.03, backZ + sdep - 0.03]) b.add('paint', box('paint', 0.035, 2.2, 0.035, x, floor + 1.1, z), steel);
  const racks = [0.08, 0.6, 1.1, 1.6, 2.05].map((h) => floor + h);
  for (const y of racks) b.add('paint', box('paint', rx1 - rx0 + 0.04, 0.025, sdep, (rx0 + rx1) / 2, y, sz), steel);
  // Big aluminium patelas on the bottom, trays of sweets stacked mid-height, boxes and jars above.
  for (let k = 0; k < 4; k++) pot(b, HANDI, at(rx0 + 0.35 + k * 0.62, racks[0] + 0.012, sz, 0, [2.1, 2.2, 2.1]), '#c3c6c6', 40 + k, false);
  for (let k = 0; k < 4; k++) {
    const x = rx0 + 0.35 + k * 0.62;
    tray(b, x, racks[1] + 0.012, sz + 0.02, 0.5, 0.3, (['jalebi', 'besan', 'laddoo', 'kaju'] as const)[k], r);
    b.add('paint', box('paint', 0.5, 0.02, 0.3, x, racks[1] + 0.2, sz + 0.02), '#c9cccc');
  }
  const namkeen = [['#e0b43c', '#c8962a', '#6f8a3a'], ['#e8a53a', '#d88a2a'], ['#d9b86a', '#b88a3a', '#4f7a2a']] as const;
  for (let k = 0; k < 6; k++) {
    const x = rx0 + 0.2 + k * 0.38;
    if (k % 2) jar(b, glass, x, racks[2] + 0.012, sz + 0.03, 0.09, 0.3, namkeen[k % 3], '#c8321e', 0.8, 60 + k);
    else for (let j = 0; j < 4; j++) b.add('paint', box('paint', 0.26, 0.06, 0.26, x, racks[2] + 0.045 + j * 0.062, sz), boxCols[(j + k) % boxCols.length]);
  }
  for (let k = 0; k < 4; k++) pot(b, HANDI, at(rx0 + 0.32 + k * 0.6, racks[3] + 0.012, sz, 0, [1.6, 1.4, 1.6]), '#c3c6c6', 70 + k, false);
  for (let k = 0; k < 3; k++) b.add('paint', weather(box('paint', 0.5, 0.26, 0.34, rx0 + 0.4 + k * 0.8, racks[4] + 0.14, sz), '#a47c4c', { ground: racks[4], strength: 0.15 }));

  // ---- the shop's puja shelf: a brass samai, a garland, incense --------------------------------------
  const shx = ox - 0.13;
  const shz = backZ + 1.0;
  const shy = floor + 1.95;
  b.add('teak', fill(box('teak', 0.22, 0.03, 0.42, shx, shy, shz), '#5a3a22'));
  for (const dz of [-0.15, 0.15]) b.add('teak', fill(box('teak', 0.03, 0.12, 0.03, shx + 0.06, shy - 0.07, shz + dz), '#5a3a22'));
  b.add('brass', new LatheGeometry([[0.001, 0], [0.05, 0], [0.045, 0.01], [0.012, 0.03], [0.01, 0.16], [0.035, 0.17], [0.05, 0.19], [0.001, 0.185]].map(([a, c]) => new Vector2(a, c)), 10).translate(shx, shy + 0.015, shz));
  lights.flames.push([new Vector3(shx, shy + 0.2, shz + 0.035), 0.9], [new Vector3(shx, shy + 0.2, shz - 0.035), 0.9]);
  b.add('brass', new LatheGeometry(LOTA.map(([a, c]) => new Vector2(a, c)), 10).scale(0.8, 0.8, 0.8).translate(shx, shy + 0.015, shz + 0.14));
  marigoldHeap(b, at(shx, shy + 0.015, shz - 0.14), 0.05, 0.035, 7);
  garland(b, [new Vector3(ox - 0.02, shy + 0.45, shz - 0.25), new Vector3(ox - 0.07, shy + 0.3, shz), new Vector3(ox - 0.02, shy + 0.45, shz + 0.25)], { bead: 0.025 });
  b.add('paint', rod(new Vector3(shx - 0.02, shy + 0.015, shz - 0.08), new Vector3(shx - 0.05, shy + 0.25, shz - 0.1), 0.002, 3), '#6a3a2a');
  lights.flames.push([new Vector3(shx - 0.05, shy + 0.24, shz - 0.1), 0.25]);

  // ---- lanterns under the awning, tube light inside ----------------------------------------------------
  for (const lx of [-1.95, 1.95]) {
    const lz = f.poleZ - 0.55;
    const topY = f.awningAt(lz) - 0.04;
    const ly = 2.18;
    b.add('paint', rod(new Vector3(lx, topY, lz), new Vector3(lx, ly + 0.32, lz), 0.004, 3), '#2a2a2a');
    b.add('lamplit', new LatheGeometry([[0.001, 0], [0.09, 0.02], [0.15, 0.13], [0.15, 0.19], [0.09, 0.3], [0.001, 0.32]].map(([a, c]) => new Vector2(a, c)), 6).translate(lx, ly, lz));
    for (const y of [ly + 0.01, ly + 0.31]) b.add('paint', new CylinderGeometry(0.07, 0.07, 0.025, 6).translate(lx, y, lz), '#a8321e');
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      b.add('paint', new BoxGeometry(0.018, 0.22, 0.004).rotateY(-ang).translate(lx + Math.cos(ang) * 0.1, ly - 0.1, lz + Math.sin(ang) * 0.1), k % 2 ? TONE.marigoldYellow : '#c8321e');
    }
  }
  lights.lamps.push([new Vector3(0, 2.2, f.poleZ - 0.7), 2.6, '#ffb060', 8]);
  b.add('paint', box('paint', 1.35, 0.04, 0.06, 0.4, openTop - 0.03, hd - 0.4), '#e8e4da');
  b.add('lamplit', new CylinderGeometry(0.018, 0.018, 1.25, 6).rotateZ(Math.PI / 2).translate(0.4, openTop - 0.07, hd - 0.4));
}

// ---- Sweets --------------------------------------------------------------------------------------

type SweetKind = 'modak' | 'mawaModak' | 'laddoo' | 'besan' | 'jalebi' | 'kaju' | 'pista' | 'peda' | 'jamun';

const MODAK: [number, number][] = [[0.001, 0], [0.024, 0.006], [0.028, 0.02], [0.016, 0.043], [0.001, 0.063]];

/** Ukadiche modak: a pleated dumpling with a pointed top — Ganesha's favourite. */
function modak(b: Batch, m: Matrix4, color: string, seed: number): void {
  const g = new LatheGeometry(MODAK.map(([a, c]) => new Vector2(a, c)), 6);
  fill(g, color);
  shade(g, (x, y, z) => (y > 0.012 ? 0.86 + 0.14 * Math.abs(Math.cos(Math.atan2(z, x) * 3)) : 0.95) * (0.97 + (seed % 3) * 0.015));
  b.add('paint', g, m);
}

function jalebiCoil(b: Batch, m: Matrix4, color: string): void {
  b.add('paint', new TorusGeometry(0.03, 0.0065, 3, 10).rotateX(Math.PI / 2), m, color);
  b.add('paint', new TorusGeometry(0.014, 0.006, 3, 6).rotateX(Math.PI / 2).translate(0.005, 0.004, 0), m, color);
}

/** A steel tray of one sweet, arranged the way a halwai lays them out. */
function tray(b: Batch, x: number, y: number, z: number, w: number, d: number, kind: SweetKind, r: Rand): void {
  b.add('paint', box('paint', w, 0.018, d, x, y + 0.009, z), '#c9cccc');
  b.add('paint', box('paint', w + 0.01, 0.022, 0.01, x, y + 0.011, z + d / 2), '#b3b6b6');
  const top = y + 0.018;
  const grid = (sp: number, fn: (px: number, pz: number, i: number) => void) => {
    const nx = Math.max(1, Math.floor((w - 0.03) / sp));
    const nz = Math.max(1, Math.floor((d - 0.03) / sp));
    let i = 0;
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) fn(x - ((nx - 1) * sp) / 2 + ix * sp, z - ((nz - 1) * sp) / 2 + iz * sp, i++);
  };
  switch (kind) {
    case 'modak':
    case 'mawaModak':
      grid(0.065, (px, pz, i) => modak(b, at(px, top, pz, i * 0.7), kind === 'modak' ? '#f1ebdc' : '#e8a24a', i));
      break;
    case 'laddoo':
    case 'besan': {
      const pal = kind === 'laddoo' ? ['#f09a2a', '#f2b03a', '#e8862a'] : ['#d9a24a', '#c99040', '#e0b060'];
      grid(0.066, (px, pz, i) => {
        b.add('paint', mosaic(new IcosahedronGeometry(0.03, 0).translate(px, top + 0.027, pz), pal, i, 0.1));
      });
      // A second layer, pyramid-fashion.
      for (let k = 0; k < 3; k++) b.add('paint', mosaic(new IcosahedronGeometry(0.03, 0).translate(x - 0.065 + k * 0.065, top + 0.075, z), pal, 50 + k, 0.1));
      break;
    }
    case 'jalebi':
      for (let k = 0; k < 10; k++) jalebiCoil(b, at(x + (r() - 0.5) * (w - 0.08), top + 0.008 + (k % 3) * 0.011, z + (r() - 0.5) * (d - 0.08), r() * 6, 1, (r() - 0.5) * 0.4), '#e5861f');
      break;
    case 'kaju':
    case 'pista':
      grid(0.058, (px, pz) => {
        const col = kind === 'kaju' ? '#eee2c6' : '#bccb8e';
        b.add('paint', new BoxGeometry(0.042, 0.013, 0.042).rotateY(Math.PI / 4).translate(px, top + 0.007, pz), col);
        b.add('paint', new BoxGeometry(0.036, 0.002, 0.036).rotateY(Math.PI / 4).translate(px, top + 0.0145, pz), '#dcdcd8');
      });
      break;
    case 'peda':
      grid(0.055, (px, pz) => {
        b.add('paint', new CylinderGeometry(0.022, 0.024, 0.014, 8).translate(px, top + 0.007, pz), '#b98752');
      });
      break;
    case 'jamun': {
      b.add('paint', new LatheGeometry([[0.001, 0], [0.12, 0], [0.15, 0.06], [0.155, 0.065], [0.001, 0.05]].map(([a, c]) => new Vector2(a, c)), 16).translate(x, top, z), '#c9cccc');
      b.add('paint', new CylinderGeometry(0.145, 0.145, 0.004, 16).translate(x, top + 0.052, z), '#7a3a12');
      for (let k = 0; k < 9; k++) {
        const ang = k * 0.7;
        const rr = k === 0 ? 0 : 0.085;
        b.add('paint', new IcosahedronGeometry(0.028, 0).translate(x + Math.cos(ang) * rr, top + 0.058, z + Math.sin(ang) * rr), '#4a2210');
      }
      break;
    }
  }
}

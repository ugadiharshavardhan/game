/**
 * The village is held to its level-design brief by real walking distances on the navigation grid:
 * reachability, route choice, shelter coverage, and that every offering spot's tags are true.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { VILLAGE } from './layout';
import { buildNavGrid, cellOf, distanceField, nearestFree, type NavGrid, traceBack } from './navgrid';
import { LEVEL_RULES as R } from './rules';
import { buildLevel, type BoxSolid, type Level, type Solid } from './solids';

let level: Level;
let grid: NavGrid;
let fromTemple: Float64Array;
let toShelter: Float64Array; // min walk to any shelter door, per cell

const at = (x: number, z: number, reach = 2.2) => nearestFree(grid, x, z, reach);

beforeAll(() => {
  level = buildLevel(VILLAGE);
  grid = buildNavGrid(VILLAGE, level);
  fromTemple = distanceField(grid, at(level.templeOffer.x, level.templeOffer.z));
  toShelter = new Float64Array(grid.cols * grid.rows).fill(Infinity);
  for (const d of level.doors.filter((d) => d.shelter)) {
    const f = distanceField(grid, at(d.x, d.z));
    for (let i = 0; i < f.length; i++) if (f[i] < toShelter[i]) toShelter[i] = f[i];
  }
}, 30000);

describe('layout sanity', () => {
  it('has 8–12 houses, most of them shelters, and one home', () => {
    const houses = VILLAGE.houses.filter((h) => (h.kind ?? 'house') === 'house');
    expect(houses.length).toBeGreaterThanOrEqual(8);
    expect(houses.length).toBeLessThanOrEqual(12);
    expect(houses.filter((h) => h.shelter).length).toBeGreaterThanOrEqual(7);
    expect(VILLAGE.houses.filter((h) => h.start)).toHaveLength(1);
  });

  it('has every area the brief asks for', () => {
    const kinds = new Set(VILLAGE.areas.map((a) => a.kind));
    for (const k of ['home', 'square', 'temple', 'garden', 'farm', 'orchard', 'grove', 'kirana', 'sweets'] as const) expect(kinds).toContain(k);
    expect(VILLAGE.shops.map((s) => s.kind).sort()).toEqual(['kirana', 'sweets']);
    expect(VILLAGE.roads.filter((r) => r.kind === 'main')).toHaveLength(1);
    expect(VILLAGE.roads.filter((r) => r.kind !== 'main').length).toBeGreaterThanOrEqual(4);
  });

  it('no two structures overlap', () => {
    const structures = level.solids.filter(
      (s): s is BoxSolid => s.kind === 'box' && s.nav === 'block' && s.layer !== 'none' && s.tag !== 'edge' && !s.tag.startsWith('fence'),
    );
    const owner = (s: Solid) => s.tag.split(':').slice(0, 2).join(':');
    const clashes: string[] = [];
    for (let i = 0; i < structures.length; i++) {
      for (let j = i + 1; j < structures.length; j++) {
        const a = structures[i];
        const b = structures[j];
        if (owner(a) === owner(b)) continue;
        if (a.tag.startsWith('wall:') && b.tag.startsWith('wall:')) continue; // corners share ends
        if (obbOverlap(a, b, -0.05)) clashes.push(`${a.tag} × ${b.tag}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('roads are clear of buildings along their whole length', () => {
    const blockers = level.solids.filter(
      (s): s is BoxSolid => s.kind === 'box' && s.nav === 'block' && s.layer !== 'none' && (s.tag.startsWith('house') || s.tag.startsWith('shop') || s.tag.startsWith('wall') || s.tag.startsWith('landmark')),
    );
    const hits: string[] = [];
    for (const road of VILLAGE.roads) {
      for (let k = 0; k + 1 < road.points.length; k++) {
        const a = road.points[k];
        const b = road.points[k + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        for (let t = 0; t <= len; t += 0.5) {
          const x = a.x + ((b.x - a.x) * t) / len;
          const z = a.z + ((b.z - a.z) * t) / len;
          const half = road.width / 2 - 0.4; // the verge may touch a step
          for (const s of blockers) {
            if (obbOverlap(s, { kind: 'box', x, y: 0, z, sx: half * 2, sy: 1, sz: half * 2, rot: 0, layer: 'none', nav: 'block', tag: 'probe' }, 0)) {
              hits.push(`${road.id} @ (${x.toFixed(1)}, ${z.toFixed(1)}) × ${s.tag}`);
            }
          }
        }
      }
    }
    expect([...new Set(hits.map((h) => h.split(' × ')[1] + ' on ' + h.split(' @')[0]))]).toEqual([]);
  });
});

describe('playable from beginning to temple', () => {
  it('spawn stands on free ground', () => {
    const i = cellOf(grid, level.spawn.x, level.spawn.z);
    expect(grid.blocked[i]).toBe(0);
  });

  it('the temple offering point is reachable from home', () => {
    const d = fromTemple[at(level.spawn.x, level.spawn.z)];
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(80); // it is a journey…
    expect(d).toBeLessThan(140); // …but a compact one
  });

  it('every house door is reachable (up its steps)', () => {
    const unreachable = level.doors.filter((d) => !Number.isFinite(fromTemple[at(d.x, d.z)])).map((d) => d.houseId);
    expect(unreachable).toEqual([]);
  });

  it('every offering spot is reachable', () => {
    const unreachable = VILLAGE.offerings.filter((o) => !Number.isFinite(fromTemple[at(o.x, o.z)])).map((o) => o.id);
    expect(unreachable).toEqual([]);
  });

  it('every area is reachable', () => {
    // Area centres can sit inside a building or the tank; test the nearest place you can stand.
    const unreachable = VILLAGE.areas.filter((a) => !Number.isFinite(fromTemple[at(a.x, a.z, 7)])).map((a) => a.id);
    expect(unreachable).toEqual([]);
  });
});

describe('shelter coverage (the moon is never unfair)', () => {
  it.each([
    ...VILLAGE.offerings.map((o) => [`offering ${o.id}`, o.x, o.z] as const),
    ...VILLAGE.areas.map((a) => [`area ${a.id}`, a.x, a.z] as const),
    ['spawn', VILLAGE.spawn.x, VILLAGE.spawn.z] as const,
    ['temple', VILLAGE.temple.offerX, VILLAGE.temple.offerZ] as const,
  ])(`%s has a shelter within ${R.maxWalkToShelter} m`, (_, x, z) => {
    expect(toShelter[at(x, z, 7)]).toBeLessThanOrEqual(R.maxWalkToShelter);
  });

  it(`nowhere walkable is more than ${R.maxAnywhereToShelter} m from shelter`, () => {
    let worst = 0;
    let where = '';
    for (let i = 0; i < toShelter.length; i++) {
      if (grid.blocked[i] || !Number.isFinite(fromTemple[i])) continue;
      if (toShelter[i] > worst) {
        worst = toShelter[i];
        const c = i % grid.cols;
        where = `(${(grid.minX + c * grid.cell).toFixed(0)}, ${(grid.minZ + Math.floor(i / grid.cols) * grid.cell).toFixed(0)})`;
      }
    }
    expect(worst, `worst point ${where}`).toBeLessThanOrEqual(R.maxAnywhereToShelter);
  });
});

describe('offering spots mean what their tags say', () => {
  const spots = VILLAGE.offerings;
  it.each(spots.map((o) => [o.id, o] as const))('%s', (_, o) => {
    const i = at(o.x, o.z);
    const temple = fromTemple[i];
    const shelter = toShelter[i];
    const detail = `temple ${temple.toFixed(1)} m, shelter ${shelter.toFixed(1)} m`;
    if (o.tags.includes('near-temple')) expect(temple, detail).toBeLessThanOrEqual(R.nearTemple);
    if (o.tags.includes('far-from-temple')) expect(temple, detail).toBeGreaterThanOrEqual(R.farFromTemple);
    if (o.tags.includes('near-shelter')) expect(shelter, detail).toBeLessThanOrEqual(R.nearShelter);
    if (o.tags.includes('risky')) expect(shelter, detail).toBeGreaterThanOrEqual(R.risky);
  });

  it('each kind of spot is represented at least twice', () => {
    for (const tag of ['near-temple', 'far-from-temple', 'near-shelter', 'risky'] as const) {
      expect(spots.filter((o) => o.tags.includes(tag)).length, tag).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('route choice', () => {
  /** A real alternative: avoid the shortest path's corridor (except near the ends) and still get there. */
  function alternative(fromX: number, fromZ: number): { shortest: number; alt: number } {
    const start = at(fromX, fromZ);
    const goal = at(level.templeOffer.x, level.templeOffer.z);
    const field = distanceField(grid, start);
    const path = traceBack(grid, field, goal);
    const closed = new Uint8Array(grid.cols * grid.rows);
    const a = path[0];
    const b = path[path.length - 1];
    for (const p of path) {
      if (Math.hypot(p.x - a.x, p.z - a.z) < R.routeSharedEnds || Math.hypot(p.x - b.x, p.z - b.z) < R.routeSharedEnds) continue;
      const r = Math.ceil(R.routeCorridor / grid.cell);
      const c0 = cellOf(grid, p.x, p.z);
      const col = c0 % grid.cols;
      const row = Math.floor(c0 / grid.cols);
      for (let dr = -r; dr <= r; dr++)
        for (let dc = -r; dc <= r; dc++) {
          if (dr * dr + dc * dc > r * r) continue;
          const cc = col + dc;
          const rr = row + dr;
          if (cc >= 0 && rr >= 0 && cc < grid.cols && rr < grid.rows) closed[rr * grid.cols + cc] = 1;
        }
    }
    const alt = distanceField(grid, start, closed)[goal];
    return { shortest: field[goal], alt };
  }

  const starts: Array<[string, number, number]> = [
    ['home', VILLAGE.spawn.x, VILLAGE.spawn.z],
    ['festival ground', -1, 4],
    ...VILLAGE.offerings.filter((o) => !o.tags.includes('near-temple')).map((o): [string, number, number] => [o.id, o.x, o.z]),
  ];
  // Each case runs three full-map searches; generous timeout so a busy machine can't fail it.
  it.each(starts)('%s → temple has a genuinely different second route', { timeout: 60_000 }, (_, x, z) => {
    const { shortest, alt } = alternative(x, z);
    expect(Number.isFinite(alt), 'no alternative route at all').toBe(true);
    expect(alt / shortest).toBeLessThanOrEqual(R.alternativeRouteFactor);
  });
});

// ---- helpers ---------------------------------------------------------------------------------

/** Separating-axis overlap of two y-rotated boxes in plan view. `margin` > 0 inflates, < 0 shrinks. */
function obbOverlap(a: BoxSolid, b: BoxSolid, margin: number): boolean {
  const axes = [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2].map((r) => ({ x: Math.cos(r), z: -Math.sin(r) }));
  const corners = (s: BoxSolid) => {
    const hx = s.sx / 2 + margin;
    const hz = s.sz / 2 + margin;
    const c = Math.cos(s.rot);
    const n = Math.sin(s.rot);
    return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => ({ x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c }));
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const ax of axes) {
    const pa = ca.map((p) => p.x * ax.x + p.z * ax.z);
    const pb = cb.map((p) => p.x * ax.x + p.z * ax.z);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

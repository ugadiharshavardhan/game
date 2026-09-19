/**
 * Renders the level as a top-down PNG for design review: `LEVEL_MAP=docs/level-map.png npx vitest run levelMap`.
 * Skipped otherwise. Walkable ground is shaded by walking distance to the nearest shelter door.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'vitest';
import { VILLAGE } from '../../src/game/world/village/layout';
import { buildNavGrid, distanceField, nearestFree } from '../../src/game/world/village/navgrid';
import { LEVEL_RULES } from '../../src/game/world/village/rules';
import { buildLevel } from '../../src/game/world/village/solids';

const OUT = process.env.LEVEL_MAP;
const REPORT = process.env.LEVEL_REPORT;

describe.skipIf(!OUT)('level map', () => {
  it('writes the PNG', () => {
    const level = buildLevel(VILLAGE);
    const g = buildNavGrid(VILLAGE, level);
    const S = 2; // pixels per cell
    const W = g.cols * S;
    const H = g.rows * S;
    const px = new Uint8Array(W * H * 3);
    const put = (x: number, y: number, [r, gg, b]: number[]) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3;
      px[i] = r;
      px[i + 1] = gg;
      px[i + 2] = b;
    };
    const toShelter = new Float64Array(g.cols * g.rows).fill(Infinity);
    for (const d of level.doors.filter((d) => d.shelter)) {
      const f = distanceField(g, nearestFree(g, d.x, d.z, 2.2));
      for (let i = 0; i < f.length; i++) if (f[i] < toShelter[i]) toShelter[i] = f[i];
    }
    for (let i = 0; i < g.blocked.length; i++) {
      const col = i % g.cols;
      const row = Math.floor(i / g.cols);
      let c: number[];
      if (g.blocked[i]) c = [40, 34, 30];
      else if (!Number.isFinite(toShelter[i])) c = [120, 0, 120];
      else {
        const t = Math.min(toShelter[i] / LEVEL_RULES.maxWalkToShelter, 1.25);
        c = t > 1 ? [200, 60, 50] : [Math.round(90 + 150 * t), Math.round(190 - 60 * t), Math.round(120 - 60 * t)];
      }
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) put(col * S + dx, row * S + dy, c);
    }
    const dot = (x: number, z: number, r: number, c: number[]) => {
      const cx = ((x - g.minX) / g.cell) * S;
      const cy = ((z - g.minZ) / g.cell) * S;
      for (let y = -r; y <= r; y++) for (let x2 = -r; x2 <= r; x2++) if (x2 * x2 + y * y <= r * r) put(Math.round(cx + x2), Math.round(cy + y), c);
    };
    for (const d of level.doors) dot(d.x, d.z, 5, d.shelter ? [80, 200, 255] : [150, 150, 150]);
    for (const o of VILLAGE.offerings) dot(o.x, o.z, 5, o.tags.includes('risky') ? [255, 80, 40] : [255, 220, 60]);
    dot(level.spawn.x, level.spawn.z, 7, [255, 255, 255]);
    dot(level.templeOffer.x, level.templeOffer.z, 7, [255, 140, 0]);
    writeFileSync(OUT as string, png(W, H, px));
  });
});

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** `LEVEL_REPORT=file.md npx vitest run tools/level` — measured walking distances per offering spot. */
describe.skipIf(!REPORT)('level report', () => {
  it('writes the markdown table', () => {
    const level = buildLevel(VILLAGE);
    const g = buildNavGrid(VILLAGE, level);
    const at = (x: number, z: number) => nearestFree(g, x, z, 2.2);
    const temple = distanceField(g, at(level.templeOffer.x, level.templeOffer.z));
    const shelters = level.doors.filter((d) => d.shelter).map((d) => ({ d, f: distanceField(g, at(d.x, d.z)) }));
    const area = (x: number, z: number) =>
      VILLAGE.areas.find((a) => Math.abs(x - a.x) <= a.w / 2 && Math.abs(z - a.z) <= a.d / 2)?.name ?? 'lanes';
    const rows = VILLAGE.offerings.map((o) => {
      const i = at(o.x, o.z);
      const best = shelters.reduce((b, s) => (s.f[i] < b.f[i] ? s : b));
      return `| ${o.id} | ${o.item} | ${area(o.x, o.z)} | ${o.tags.join(', ') || '—'} | ${temple[i].toFixed(0)} m | ${best.f[i].toFixed(0)} m (${best.d.family}) |`;
    });
    const home = temple[at(level.spawn.x, level.spawn.z)];
    writeFileSync(
      REPORT as string,
      [
        `Home → temple: **${home.toFixed(0)} m** on foot.`,
        '',
        '| Spot | Offering | Area | Design tags | Walk to temple | Walk to nearest shelter |',
        '| --- | --- | --- | --- | --- | --- |',
        ...rows,
        '',
      ].join('\n'),
    );
  });
});

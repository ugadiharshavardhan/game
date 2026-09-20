import { describe, expect, it } from 'vitest';
import { VILLAGE } from '../world/village/layout';
import { compass, describeSpot, HINTS, MapSystem, type MapSource } from './MapSystem';

const sources = (left: Record<string, number> = {}): MapSource[] =>
  VILLAGE.offerings.map((o) => ({ id: o.id, item: o.item, x: o.x, z: o.z, left: () => left[o.id] ?? o.quantity }));

describe('compass', () => {
  it('has north at the top of the map (−z) and the temple in it', () => {
    expect(compass(0, -49)).toBe('North');
    expect(compass(0, 46)).toBe('South');
    expect(compass(50, 0)).toBe('East');
    expect(compass(-30, 30)).toBe('South-west');
  });
});

describe('describeSpot', () => {
  it('names a direction and the nearest house or shop', () => {
    const rice = VILLAGE.offerings.find((o) => o.id === 'rice-kirana')!;
    expect(describeSpot(rice.x, rice.z, VILLAGE)).toMatch(/^(South|South-west) · near Ganesh Kirana Stores$/);
    const modak = VILLAGE.offerings.find((o) => o.id === 'modak-sweets')!;
    expect(describeSpot(modak.x, modak.z, VILLAGE)).toMatch(/^North.* · near Laxmi Mithai$/);
  });

  it('says something for every offering in the village', () => {
    for (const o of VILLAGE.offerings) expect(describeSpot(o.x, o.z, VILLAGE), o.id).toMatch(/\S/);
  });
});

describe('MapSystem', () => {
  it('shows nothing at the start', () => {
    expect(new MapSystem(sources(), VILLAGE).spots()).toEqual([]);
  });

  it('turns a spot into a faint hint when its villager has been talked to', () => {
    const map = new MapSystem(sources(), VILLAGE);
    map.hear('Ganpat-kaka');
    const spots = map.spots();
    expect(spots.map((s) => [s.id, s.state])).toEqual([['modak-sweets', 'hinted']]);
    expect(spots[0].hint).toContain('Laxmi Mithai');
  });

  it('turns it into a pin once the player is close, and keeps it one', () => {
    const map = new MapSystem(sources(), VILLAGE);
    map.hear('Ganpat-kaka');
    map.see(-6, -25);
    expect(map.spots()[0].state).toBe('found');
    map.see(40, 40);
    expect(map.spots()[0].state).toBe('found');
  });

  it('finds spots nobody talks about just by walking there', () => {
    const map = new MapSystem(sources(), VILLAGE);
    map.see(-5.6, 45.8);
    expect(map.spots().map((s) => s.id)).toContain('flowers-home');
  });

  it('drops a spot when it has been emptied, and brings it back when it is restocked', () => {
    const left: Record<string, number> = {};
    const map = new MapSystem(sources(left), VILLAGE);
    map.see(-6, -30);
    expect(map.spots().map((s) => s.id)).toContain('modak-sweets');
    left['modak-sweets'] = 0;
    expect(map.spots().map((s) => s.id)).not.toContain('modak-sweets');
    delete left['modak-sweets'];
    expect(map.spots().map((s) => s.id)).toContain('modak-sweets');
  });

  it('leaves off a kind the puja no longer needs', () => {
    const map = new MapSystem(sources(), VILLAGE, (item) => item !== 'modak');
    map.see(-6, -30);
    expect(map.spots().map((s) => s.id)).not.toContain('modak-sweets');
  });

  it('only reports a change when there is one', () => {
    const map = new MapSystem(sources(), VILLAGE);
    expect(map.changed()).toBeNull();
    map.hear('Raju');
    expect(map.changed()).toHaveLength(1);
    expect(map.changed()).toBeNull();
  });

  it('only names spots that exist', () => {
    const ids = new Set(VILLAGE.offerings.map((o) => o.id));
    for (const list of Object.values(HINTS)) for (const id of list) expect(ids.has(id), id).toBe(true);
  });
});

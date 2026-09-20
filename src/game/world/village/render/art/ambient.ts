/**
 * The air itself: dust in the last of the sun, and fireflies once it has gone.
 *
 * Two point clouds that follow the player — motes lit by the low sun, drifting on the same wind
 * that moves the flags, and fireflies that come out at dusk, hover at hedge height and blink.
 * Both are pools: a particle that drifts too far is not destroyed, it is moved back to the other
 * side of the player and given a new life. Nothing is ever allocated after the first frame.
 *
 * Two draw calls for the whole village's atmosphere, and on a phone half as many particles.
 */
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, PointsMaterial, Vector3 } from 'three';
import { glow } from './canvasTextures';
import type { ArtContext } from './runtime';

/** How far from the player particles live, in metres. */
const RADIUS = 22;
const HEIGHT = 7;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Blink phase and rate, for the fireflies. */
  phase: number;
  rate: number;
  /** A little variety in brightness. */
  bright: number;
}

export function build(a: ArtContext): boolean {
  const count = a.quality.particles;
  if (count <= 0) return false;
  const motes = Math.round(count * 0.55);
  const flies = count - motes;

  const cloud = (n: number, size: number, colour: Color, additive: boolean) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 3), 3));
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([colour.r, colour.g, colour.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(c, 3));
    const p = new Points(
      g,
      new PointsMaterial({
        map: glow(a.bank),
        size,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        ...(additive ? { blending: AdditiveBlending } : {}),
      }),
    );
    p.frustumCulled = false;
    p.renderOrder = 2;
    a.root.add(p);
    return p;
  };

  const dust = cloud(motes, 0.055, new Color(0.55, 0.47, 0.36), false);
  const fireflies = cloud(flies, 0.09, new Color(1.5, 1.25, 0.4), true);

  const seed = (n: number): Particle[] =>
    Array.from({ length: n }, () => ({
      x: (Math.random() - 0.5) * RADIUS * 2,
      y: Math.random() * HEIGHT,
      z: (Math.random() - 0.5) * RADIUS * 2,
      vx: 0,
      vy: 0,
      vz: 0,
      phase: Math.random() * Math.PI * 2,
      rate: 0.6 + Math.random() * 1.6,
      bright: 0.6 + Math.random() * 0.7,
    }));
  const dustPool = seed(motes);
  const flyPool = seed(flies);

  const wind = new Vector3();
  const at = new Vector3();

  a.tick.push((dt, time, camera) => {
    at.copy(camera);
    // One wind for the whole village, turning slowly. The flags and the cloth use the same idea.
    const strength = 0.35 + 0.25 * Math.sin(time * 0.07);
    wind.set(Math.cos(time * 0.05) * strength, 0, Math.sin(time * 0.043) * strength);

    const night = a.shared.moonlight;
    // Dust is a thing of the last light; fireflies come out as it goes.
    const dustLevel = Math.max(0, 1 - night * 1.8);
    const flyLevel = Math.min(Math.max((night - 0.18) * 1.8, 0), 1);
    dust.visible = dustLevel > 0.02;
    fireflies.visible = flyLevel > 0.02;

    if (dust.visible) {
      const pos = dust.geometry.getAttribute('position') as Float32BufferAttribute;
      const col = dust.geometry.getAttribute('color') as Float32BufferAttribute;
      for (let i = 0; i < dustPool.length; i++) {
        const p = dustPool[i];
        p.x += (wind.x * 0.6 + Math.sin(time * 0.6 + p.phase) * 0.12) * dt;
        p.z += (wind.z * 0.6 + Math.cos(time * 0.5 + p.phase) * 0.12) * dt;
        p.y += (0.06 + Math.sin(time * 0.9 + p.phase) * 0.05) * dt;
        recycle(p, at);
        pos.setXYZ(i, at.x + p.x, p.y, at.z + p.z);
        const k = dustLevel * p.bright;
        col.setXYZ(i, 0.55 * k, 0.47 * k, 0.36 * k);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    if (fireflies.visible) {
      const pos = fireflies.geometry.getAttribute('position') as Float32BufferAttribute;
      const col = fireflies.geometry.getAttribute('color') as Float32BufferAttribute;
      for (let i = 0; i < flyPool.length; i++) {
        const p = flyPool[i];
        // A firefly's wander: a slow drift with a little steering of its own.
        p.vx += (Math.sin(time * p.rate + p.phase) * 0.4 - p.vx) * dt;
        p.vz += (Math.cos(time * p.rate * 0.8 + p.phase) * 0.4 - p.vz) * dt;
        p.vy += (Math.sin(time * 0.7 + p.phase * 2) * 0.18 - p.vy) * dt;
        p.x += (p.vx + wind.x * 0.2) * dt;
        p.z += (p.vz + wind.z * 0.2) * dt;
        p.y = Math.min(Math.max(p.y + p.vy * dt, 0.35), 2.8);
        recycle(p, at);
        pos.setXYZ(i, at.x + p.x, p.y, at.z + p.z);
        // Blinking: mostly dark, with a slow warm pulse.
        const blink = Math.max(0, Math.sin(time * p.rate * 1.7 + p.phase)) ** 3;
        const k = flyLevel * p.bright * blink;
        col.setXYZ(i, 1.5 * k, 1.25 * k, 0.4 * k);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
  });

  return false; // draws no solids: the greybox still covers everything it doesn't.
}

/** A particle that has drifted out of reach comes back on the other side, still itself. */
function recycle(p: Particle, at: Vector3): void {
  if (p.x > RADIUS) p.x -= RADIUS * 2;
  else if (p.x < -RADIUS) p.x += RADIUS * 2;
  if (p.z > RADIUS) p.z -= RADIUS * 2;
  else if (p.z < -RADIUS) p.z += RADIUS * 2;
  if (p.y > HEIGHT) p.y = 0.2;
  void at;
}

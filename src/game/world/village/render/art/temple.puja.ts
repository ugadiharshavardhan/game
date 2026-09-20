/**
 * The closing puja: what the temple does while the camera takes over.
 *
 * Marigold petals come down over the platform, sparks lift off the diyas, and the sanctum's
 * lamps come up until the god is the brightest thing in the village. Two point clouds and a
 * number — nothing here costs anything until the last offering is given.
 *
 * Everything is respectful by construction: the offerings are placed, the lamps are lit, and the
 * murti is never touched, moved or obscured.
 */
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, PointsMaterial, Vector3 } from 'three';
import { glow } from './canvasTextures';
import type { ArtContext } from './runtime';

const PETALS = 150;
const SPARKS = 70;

export interface PujaCeremony {
  /** 0..1 — how far the sanctum's lamps have come up; the renderer's templeGlow rides on it. */
  readonly glow: number;
  start(at: Vector3): void;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

export function buildCeremony(a: ArtContext): PujaCeremony {
  const petalTex = a.bank.canvas('puja:petal', [64, 64], (g, w) => {
    // A marigold petal: a soft, slightly ragged oval, brightest at its heart.
    const grad = g.createRadialGradient(w / 2, w * 0.58, 1, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,236,186,1)');
    grad.addColorStop(0.45, 'rgba(255,176,54,0.98)');
    grad.addColorStop(1, 'rgba(226,116,22,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w / 2, w / 2, w * 0.3, w * 0.46, 0, 0, Math.PI * 2);
    g.fill();
  }, true, false);

  const cloud = (count: number, size: number, tex: typeof petalTex, colour: Color, additive: boolean) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.set([colour.r, colour.g, colour.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(c, 3));
    const p = new Points(
      g,
      new PointsMaterial({ map: tex, size, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, ...(additive ? { blending: AdditiveBlending } : {}) }),
    );
    p.frustumCulled = false;
    p.visible = false;
    p.renderOrder = 3;
    a.root.add(p);
    return p;
  };

  const petals = cloud(PETALS, 0.17, petalTex, new Color(0.95, 0.5, 0.16), false);
  const sparks = cloud(SPARKS, 0.1, glow(a.bank), new Color(1.9, 1.15, 0.45), true);
  // Each petal: where it falls, how fast, how it turns over as it goes.
  const fall = Array.from({ length: PETALS }, () => ({ r: 0.6 + Math.random() * 3.4, a: Math.random() * Math.PI * 2, y: Math.random() * 5, v: 0.5 + Math.random() * 0.7, sway: 0.4 + Math.random() * 0.9 }));
  const rise = Array.from({ length: SPARKS }, () => ({ r: 0.5 + Math.random() * 2.6, a: Math.random() * Math.PI * 2, y: Math.random() * 2.2, v: 0.35 + Math.random() * 0.5 }));

  const origin = new Vector3();
  let glowUp = 0;
  let on = false;

  return {
    get glow() {
      return glowUp;
    },

    start(at: Vector3) {
      origin.copy(at);
      on = true;
      petals.visible = true;
      sparks.visible = true;
      petals.position.copy(at);
      sparks.position.copy(at);
    },

    update(dt: number, elapsed: number) {
      if (!on) return;
      // The lamps come up over the first three seconds and stay up.
      glowUp = Math.min(glowUp + dt / 3, 1);
      const pp = petals.geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i < PETALS; i++) {
        const f = fall[i];
        f.y -= f.v * dt;
        if (f.y < 0) {
          f.y = 4.5 + Math.random() * 2;
          f.r = 0.6 + Math.random() * 3.4;
          f.a = Math.random() * Math.PI * 2;
        }
        const drift = Math.sin(elapsed * f.sway + i) * 0.25;
        pp.setXYZ(i, Math.cos(f.a) * f.r + drift, f.y, Math.sin(f.a) * f.r + drift * 0.5);
      }
      pp.needsUpdate = true;

      const sp = sparks.geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i < SPARKS; i++) {
        const s = rise[i];
        s.y += s.v * dt;
        if (s.y > 2.6) {
          s.y = 0.15;
          s.r = 0.5 + Math.random() * 2.6;
          s.a = Math.random() * Math.PI * 2;
        }
        const wobble = Math.sin(elapsed * 2.2 + i * 1.7) * 0.06;
        sp.setXYZ(i, Math.cos(s.a) * s.r + wobble, s.y, Math.sin(s.a) * s.r + wobble);
      }
      sp.needsUpdate = true;
    },

    dispose() {
      for (const p of [petals, sparks]) {
        p.geometry.dispose();
        (p.material as PointsMaterial).dispose();
        p.removeFromParent();
      }
    },
  };
}

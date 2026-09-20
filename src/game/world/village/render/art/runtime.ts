/**
 * Per-frame pieces of the art pass that must stay cheap on WebGL: every flame in the village as
 * two point clouds, a fixed pool of real lights that follows the player, and distance culling.
 */
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  type Object3D,
  PointLight,
  Points,
  PointsMaterial,
  AdditiveBlending,
  type Scene,
  Vector3,
} from 'three';
import type { VisualsContext } from '../types';
import type { Ground } from './ground';
import { flame, glow } from './canvasTextures';
import type { MaterialKit } from './materials';
import type { TextureBank } from './textures';

export interface ArtContext extends VisualsContext {
  bank: TextureBank;
  kit: MaterialKit;
  root: Group;
  flames: FlameField;
  lamps: LampPool;
  culler: Culler;
  /** The terrain (null when built with ?only= without 'ground'): heights and surface weights. */
  ground: Ground | null;
  /** Live state shared with modules: the temple's glow, the sky, and where the player is. */
  shared: { templeGlow: number; night: number; moonlight: number; goingHome: boolean; dangerous: boolean; noise: number; player: Vector3 };
  /** Per-frame hooks (swaying cloth, flickering signs). */
  tick: Array<(dt: number, time: number, camera: Vector3) => void>;
}

/** Every art module exports this. Return false while unfinished: its greybox stays. */
export type ArtModule = (a: ArtContext) => boolean | Promise<boolean>;

// ---- Flames -----------------------------------------------------------------------------------

/**
 * Every diya, lamp and torch flame: one Points cloud for the flames, one for their halos. Points
 * always face the camera, so nothing needs billboarding, and the whole village's fire is 2 draws.
 */
export class FlameField {
  private readonly flamePos: number[] = [];
  private readonly flameSize: number[] = [];
  private readonly seeds: number[] = [];
  private flames: Points | null = null;
  private halos: Points | null = null;
  private colours: Float32BufferAttribute | null = null;
  private haloColours: Float32BufferAttribute | null = null;
  private readonly bank: TextureBank;

  constructor(bank: TextureBank) {
    this.bank = bank;
  }

  /** A flame whose base sits at p; `size` 1 = a diya. */
  add(p: Vector3, size = 1): void {
    this.flamePos.push(p.x, p.y + 0.035 * size, p.z);
    this.flameSize.push(size);
    this.seeds.push(Math.random() * 100);
  }

  get count(): number {
    return this.seeds.length;
  }

  build(scene: Object3D): void {
    if (!this.count) return;
    const make = (size: number, tex: 'flame' | 'glow', colour: Color) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(this.flamePos, 3));
      const c = new Float32Array(this.count * 3);
      for (let i = 0; i < this.count; i++) c.set([colour.r, colour.g, colour.b], i * 3);
      const attr = new Float32BufferAttribute(c, 3);
      g.setAttribute('color', attr);
      const m = new PointsMaterial({
        map: tex === 'flame' ? flame(this.bank) : glow(this.bank),
        size,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const p = new Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = 2;
      scene.add(p);
      return { p, attr };
    };
    const f = make(0.11, 'flame', new Color(2.2, 1.6, 0.9));
    const h = make(0.55, 'glow', new Color(0.55, 0.28, 0.08));
    this.flames = f.p;
    this.colours = f.attr;
    this.halos = h.p;
    this.haloColours = h.attr;
  }

  /** `boost` lifts every flame as the sky goes down: the warm half of the night's contrast. */
  update(time: number, boost = 1): void {
    if (!this.colours || !this.haloColours) return;
    const c = this.colours.array as Float32Array;
    const hc = this.haloColours.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const s = this.seeds[i];
      const f = 0.82 + 0.12 * Math.sin(time * 11 + s) + 0.07 * Math.sin(time * 23.7 + s * 3.1);
      const k = f * this.flameSize[i] * boost;
      c[i * 3] = 2.2 * k;
      c[i * 3 + 1] = 1.55 * k;
      c[i * 3 + 2] = 0.85 * k;
      hc[i * 3] = 0.55 * k;
      hc[i * 3 + 1] = 0.28 * k;
      hc[i * 3 + 2] = 0.08 * k;
    }
    this.colours.needsUpdate = true;
    this.haloColours.needsUpdate = true;
  }

  dispose(): void {
    for (const p of [this.flames, this.halos]) {
      if (!p) continue;
      p.geometry.dispose();
      (p.material as PointsMaterial).dispose();
      p.removeFromParent();
    }
  }
}

// ---- Real lights -------------------------------------------------------------------------------

interface Anchor {
  p: Vector3;
  colour: Color;
  intensity: number;
  distance: number;
  /** This flame's own phase, so no two lamps in the village flicker together. */
  seed: number;
}

/**
 * A fixed handful of PointLights shared by all the village's lamps. Every lamp is an anchor; the
 * pool follows the lamps nearest the camera, fading lights out before moving them and in after —
 * so the shader's light count never changes (no recompiles) and the cost is constant.
 */
export class LampPool {
  private readonly anchors: Anchor[] = [];
  private readonly lights: PointLight[] = [];
  private readonly assigned: (Anchor | null)[] = [];
  private readonly fade: number[] = [];
  private timer = 0;
  private time = 0;

  constructor(scene: Scene | Object3D, size = 6) {
    for (let i = 0; i < size; i++) {
      const l = new PointLight('#ff9a3c', 0, 6, 1.8);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
      this.assigned.push(null);
      this.fade.push(0);
    }
  }

  anchor(p: Vector3, intensity = 2.2, colour = '#ff9a3c', distance = 6): void {
    // Seeded from the lamp's own position: the same lamp flickers the same way every run, and
    // no two lamps share a phase.
    const seed = ((p.x * 12.9898 + p.z * 78.233) * 43758.5453) % (Math.PI * 2);
    this.anchors.push({ p: p.clone(), colour: new Color(colour), intensity, distance, seed });
  }

  /**
   * @param brightness the village's own fire, scaled by how dark the sky is. Not a flicker: each
   *   lamp makes its own, from its own phase. One shared flicker scalar made every lamp in the
   *   village pulse in step, which outdoors is lost against the sky but indoors — where these
   *   lights are very nearly the whole of the lighting — read as the room itself throbbing.
   */
  update(dt: number, camera: Vector3, brightness: number): void {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.4;
      const wanted = this.anchors
        .map((a) => ({ a, d: a.p.distanceToSquared(camera) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, this.lights.length)
        .map((x) => x.a);
      // Keep lights that are still wanted; free the others to fade out and move.
      for (let i = 0; i < this.lights.length; i++) {
        if (this.assigned[i] && !wanted.includes(this.assigned[i] as Anchor)) this.assigned[i] = null;
      }
      for (const a of wanted) {
        if (this.assigned.includes(a)) continue;
        const free = this.assigned.findIndex((x, i) => x === null && this.fade[i] < 0.05);
        if (free >= 0) {
          this.assigned[free] = a;
          this.lights[free].position.copy(a.p);
          this.lights[free].color.copy(a.colour);
          this.lights[free].distance = a.distance;
        }
      }
    }
    const t = this.time;
    for (let i = 0; i < this.lights.length; i++) {
      const target = this.assigned[i] ? 1 : 0;
      this.fade[i] += (target - this.fade[i]) * Math.min(dt * 3, 1);
      const a = this.assigned[i];
      if (!a) {
        this.lights[i].intensity *= this.fade[i];
        continue;
      }
      // A flame of its own: gentler than the old shared wobble, and out of step with its neighbours.
      const flicker = 0.955 + 0.03 * Math.sin(t * 8.7 + a.seed) + 0.02 * Math.sin(t * 19.7 + a.seed * 2.3);
      this.lights[i].intensity = a.intensity * this.fade[i] * brightness * flicker;
    }
  }

  dispose(): void {
    for (const l of this.lights) {
      l.removeFromParent();
      l.dispose();
    }
  }
}

// ---- Distance culling ---------------------------------------------------------------------------

/** Hides small detail (props, decals, grass) beyond a distance. Checked a few times a second. */
export class Culler {
  private readonly items: { o: Object3D; c: Vector3; d2: number }[] = [];
  private timer = 0;
  /** Everything is drawn this much nearer or further, by quality. */
  private readonly scale: number;

  constructor(scale = 1) {
    this.scale = scale;
  }

  add(o: Object3D, centre: Vector3, maxDistance: number): void {
    const d = maxDistance * this.scale;
    this.items.push({ o, c: centre.clone(), d2: d * d });
  }

  update(dt: number, camera: Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    for (const it of this.items) {
      const dx = it.c.x - camera.x;
      const dz = it.c.z - camera.z;
      it.o.visible = dx * dx + dz * dz < it.d2;
    }
  }
}

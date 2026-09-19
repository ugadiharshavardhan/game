/**
 * Evening sky, image-based light, fog and the low sun — and the Chaturthi moon that replaces it
 * when the monsoon clouds part. Shared by every scene.
 *
 * The look: Ganesh Chaturthi falls in the monsoon's tail, so the evening air is humid and warm.
 * A sun a few degrees above the western horizon, long shadows, a hazy violet-rose fog, and a cool
 * sky fill so the lamps and diyas read warm against it.
 *
 * `setMoonlight(k)` blends toward the moon, 0 → 1, in three stages the player learns to read:
 *   0 – 0.3   dusk: the sun sinks, shadows stretch, the light reddens and dims
 *   0.3 – 0.5 the light is at its dimmest, and the one shadow-casting light swings to the moon
 *   0.5 – 1   moonlight: a cool, high light from the east, a star field, blue fog, the moon's disc
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  type Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface EnvironmentOptions {
  /** Degrees above the horizon. */
  sunElevation: number;
  /** Degrees; 270 ≈ west in this world (north is −z). */
  sunAzimuth: number;
  /** Where the moon rides when the clouds part (degrees). */
  moonElevation: number;
  moonAzimuth: number;
  fogDensity: number;
  /** Half-width of the sun's shadow frustum, metres. Larger = softer, cheaper-looking shadows. */
  shadowExtent: number;
  shadowMapSize: number;
}

export interface Environment {
  sun: DirectionalLight;
  sunDir: Vector3;
  /** Toward the moon (unit), for anything that fakes its light (moonbeams through windows). */
  moonDir: Vector3;
  hemi: HemisphereLight;
  /** Keeps the shadow frustum centred on the player for crisp shadows where they matter. */
  follow(target: Vector3): void;
  /** 0 = the warm evening, 1 = full moonlight. */
  setMoonlight(k: number): void;
  dispose(): void;
}

export const EVENING: EnvironmentOptions = {
  sunElevation: 7,
  sunAzimuth: 250,
  moonElevation: 38,
  moonAzimuth: 105,
  fogDensity: 0.0115,
  shadowExtent: 26,
  shadowMapSize: 2048,
};

/** The two ends of the blend. */
const LOOK = {
  evening: {
    sun: new Color('#ffa860'),
    sunIntensity: 1.75,
    sky: new Color('#7d88bd'),
    ground: new Color('#5a3f2a'),
    hemi: 0.52,
    fog: new Color('#7a6070'),
    env: 0.4,
  },
  dusk: {
    sun: new Color('#ff6f42'),
    sunIntensity: 0.85,
    sky: new Color('#6c74a8'),
    ground: new Color('#3e2c24'),
    hemi: 0.46,
    fog: new Color('#5d4a60'),
    env: 0.3,
  },
  moon: {
    sun: new Color('#a8bdf2'),
    sunIntensity: 1.05,
    sky: new Color('#40518a'),
    ground: new Color('#16161f'),
    hemi: 0.5,
    fog: new Color('#1b2542'),
    env: 0.12,
  },
};

export function buildEnvironment(scene: Scene, renderer: WebGLRenderer, o: EnvironmentOptions = EVENING): Environment {
  const disposables: Array<{ dispose(): void }> = [];
  const dirFrom = (elev: number, az: number) => new Vector3().setFromSphericalCoords(1, MathUtils.degToRad(90 - elev), MathUtils.degToRad(az));
  const sunDir = dirFrom(o.sunElevation, o.sunAzimuth);
  const moonDir = dirFrom(o.moonElevation, o.moonAzimuth);

  const sky = new Sky();
  sky.scale.setScalar(4000);
  const skyTint = tameSun(sky);
  const u = sky.material.uniforms;
  // Low sun through humid air: a deep orange horizon, a small hot glare, a violet zenith.
  const EVENING_SKY = { turbidity: 10, rayleigh: 2.8, mieCoefficient: 0.0045, mieDirectionalG: 0.8 };
  const NIGHT_SKY = { turbidity: 2.2, rayleigh: 0.9, mieCoefficient: 0.012, mieDirectionalG: 0.93 };
  for (const [k, v] of Object.entries(EVENING_SKY)) u[k].value = v;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);

  // Image-based light from the same evening sky, so every material agrees with the horizon. At
  // night it is turned down and the hemisphere light carries the moon's blue.
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Group();
  const envSky = new Sky();
  envSky.scale.setScalar(4000);
  tameSun(envSky);
  for (const [k, v] of Object.entries(EVENING_SKY)) envSky.material.uniforms[k].value = v;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(envSky);
  const env: Texture = pmrem.fromScene(envScene as unknown as Scene, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = LOOK.evening.env;
  pmrem.dispose();
  envSky.geometry.dispose();
  envSky.material.dispose();
  disposables.push(env);

  const fog = new FogExp2(LOOK.evening.fog.clone(), o.fogDensity);
  scene.fog = fog;

  const sun = new DirectionalLight(LOOK.evening.sun.clone(), LOOK.evening.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(o.shadowMapSize, o.shadowMapSize);
  const s = sun.shadow.camera;
  s.left = -o.shadowExtent;
  s.right = o.shadowExtent;
  s.top = o.shadowExtent;
  s.bottom = -o.shadowExtent;
  s.near = 1;
  s.far = 160;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // Cool sky fill in the shadows, warm bounce from the earth: the evening's two-tone contrast.
  const hemi = new HemisphereLight(LOOK.evening.sky.clone(), LOOK.evening.ground.clone(), LOOK.evening.hemi);
  scene.add(hemi);

  // The night sky: stars and the moon's disc, following the camera at a great distance.
  const heavens = new Group();
  heavens.name = 'Heavens';
  const stars = starField();
  const moon = moonDisc(moonDir);
  heavens.add(stars, moon);
  heavens.visible = false;
  scene.add(heavens);
  disposables.push(stars.geometry, stars.material as PointsMaterial, ...moonDisposables(moon));

  // The shadow-casting light's current direction (sun, or moon).
  const lightDir = sunDir.clone();
  const texel = (o.shadowExtent * 2) / o.shadowMapSize;
  const snapped = new Vector3();
  const tmp = new Color();
  let lastK = -1;

  return {
    sun,
    sunDir,
    moonDir,
    hemi,
    follow(target: Vector3) {
      snapped.set(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(lightDir, 60);
      // The sky's furniture travels with the player: always at the same great distance.
      heavens.position.set(target.x, 0, target.z);
    },
    setMoonlight(k: number) {
      k = MathUtils.clamp(k, 0, 1);
      if (Math.abs(k - lastK) < 1e-4) return;
      lastK = k;
      const E = LOOK.evening;
      const D = LOOK.dusk;
      const M = LOOK.moon;
      // Stage weights.
      const dusk = MathUtils.smoothstep(k, 0, 0.3);
      const night = MathUtils.smoothstep(k, 0.4, 1);
      const swapped = k >= 0.4;

      // The light: sets with the sun, dims, swaps to the moon, rises with it.
      if (!swapped) {
        const elev = MathUtils.lerp(o.sunElevation, 1.2, dusk);
        lightDir.copy(dirFrom(elev, o.sunAzimuth));
        sun.color.copy(E.sun).lerp(D.sun, dusk);
        sun.intensity = MathUtils.lerp(E.sunIntensity, D.sunIntensity, dusk) * (1 - MathUtils.smoothstep(k, 0.3, 0.4) * 0.85);
      } else {
        lightDir.copy(moonDir);
        sun.color.copy(D.sun).lerp(M.sun, night);
        sun.intensity = MathUtils.lerp(0.13, M.sunIntensity, night);
      }

      hemi.color.copy(E.sky).lerp(D.sky, dusk).lerp(M.sky, night);
      hemi.groundColor.copy(E.ground).lerp(D.ground, dusk).lerp(M.ground, night);
      hemi.intensity = MathUtils.lerp(MathUtils.lerp(E.hemi, D.hemi, dusk), M.hemi, night);
      fog.color.copy(E.fog).lerp(D.fog, dusk).lerp(M.fog, night);
      fog.density = o.fogDensity * (1 + 0.15 * night);
      scene.environmentIntensity = MathUtils.lerp(MathUtils.lerp(E.env, D.env, dusk), M.env, night);

      // The sky: the evening sky dims through dusk, then the night sky's own colours take over.
      for (const [key, v] of Object.entries(EVENING_SKY)) u[key].value = MathUtils.lerp(v, NIGHT_SKY[key as keyof typeof NIGHT_SKY], night);
      u.sunPosition.value.copy(swapped ? moonDir : lightDir);
      skyTint.value.setRGB(1, 1, 1).lerp(tmp.setRGB(0.62, 0.52, 0.6), dusk).lerp(tmp.setRGB(0.075, 0.1, 0.19), night);

      heavens.visible = night > 0.02;
      (stars.material as PointsMaterial).opacity = night;
      (moon.material as MeshBasicMaterial).opacity = night;
      for (const c of moon.children) ((c as Mesh).material as MeshBasicMaterial).opacity = night * 0.55;
    },
    dispose() {
      scene.remove(sky, sun, sun.target, hemi, heavens);
      scene.environment = null;
      scene.fog = null;
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * The sky shader writes the sun's disc at hundreds of times white. Looking toward the sunset, the
 * bloom pass then floods the whole screen and the player is blinded. Clamp the output: the disc
 * still glows and blooms, the frame stays readable, and the image-based light gets no fireflies.
 * Also adds a tint, which is how the evening sky dims into night.
 */
function tameSun(sky: Sky): { value: Color } {
  const tint = { value: new Color(1, 1, 1) };
  sky.material.uniforms.skyTint = tint;
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', 'uniform vec3 skyTint;\nvoid main() {')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min( texColor, vec3( 1.7 ) ) * skyTint, 1.0 );');
  sky.material.needsUpdate = true;
  return tint;
}

/** Radius of the night sky's dome — inside the camera's far plane (500 m). */
const DOME = 440;

/** ~1500 stars on the upper half of the dome, a few bright, most faint, faintly warm or cool. */
function starField(): Points {
  const n = 1500;
  const pos: number[] = [];
  const col: number[] = [];
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const y = 0.08 + rnd() * 0.92;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * r * DOME, y * DOME, Math.sin(a) * r * DOME);
    const b = 0.35 + rnd() ** 3 * 1.4;
    const warm = rnd();
    col.push(b * (0.85 + 0.15 * warm), b * 0.92, b * (1.05 - 0.2 * warm));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  const m = new PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const p = new Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -1;
  return p;
}

/** The moon: a painted disc with its maria, and a soft halo in the humid air. */
function moonDisc(dir: Vector3): Mesh {
  const disc = canvasTexture(256, (g, w) => {
    const r = w / 2;
    const grad = g.createRadialGradient(r * 0.85, r * 0.8, r * 0.1, r, r, r);
    grad.addColorStop(0, '#fbf6e6');
    grad.addColorStop(0.8, '#e9e4d2');
    grad.addColorStop(1, '#cfc9b8');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(r, r, r - 2, 0, Math.PI * 2);
    g.fill();
    // Maria: soft grey patches.
    g.fillStyle = 'rgba(120,125,135,0.28)';
    for (const [x, y, s] of [[0.38, 0.35, 0.2], [0.58, 0.42, 0.14], [0.45, 0.6, 0.16], [0.66, 0.66, 0.1], [0.3, 0.55, 0.09]]) {
      g.beginPath();
      g.ellipse(x * w, y * w, s * w, s * w * 0.8, 0.4, 0, Math.PI * 2);
      g.fill();
    }
  });
  const halo = canvasTexture(256, (g, w) => {
    const r = w / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(210,225,255,0.9)');
    grad.addColorStop(0.18, 'rgba(170,190,240,0.35)');
    grad.addColorStop(1, 'rgba(120,140,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
  const at = dir.clone().multiplyScalar(DOME - 20);
  // ~2.2° across: larger than life, as the moon always looks near the horizon.
  const moon = new Mesh(new PlaneGeometry(16, 16), new MeshBasicMaterial({ map: disc, transparent: true, opacity: 0, depthWrite: false, fog: false, color: new Color(1.6, 1.55, 1.4) }));
  moon.position.copy(at);
  moon.lookAt(0, 0, 0);
  const glow = new Mesh(new PlaneGeometry(110, 110), new MeshBasicMaterial({ map: halo, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: AdditiveBlending }));
  glow.position.set(0, 0, -1);
  moon.add(glow);
  moon.renderOrder = -1;
  glow.renderOrder = -1;
  return moon;
}

function moonDisposables(moon: Mesh): Array<{ dispose(): void }> {
  const out: Array<{ dispose(): void }> = [];
  moon.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MeshBasicMaterial;
    out.push(m.geometry, mat);
    if (mat.map) out.push(mat.map);
  });
  return out;
}

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, w: number) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

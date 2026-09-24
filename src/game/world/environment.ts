/**
 * The sky rig: sky dome, the one shadow-casting light (the sun, and later the moon), the
 * hemisphere fill, fog, stars and the moon's disc. It holds no opinion about
 * the time of night — MoonLightingController hands it a `SkyLook` and it applies it.
 *
 * The look it starts on is the evening of Ganesh Chaturthi: the monsoon's tail, a sun a few
 * degrees above the western horizon, long shadows, a hazy violet-rose fog, and a cool sky fill so
 * the lamps and diyas read warm against it.
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
  /** Where the moon comes up, and how high it rides once it has. */
  moonAzimuth: number;
  moonRiseElevation: number;
  moonHighElevation: number;
  fogDensity: number;
  /** Half-width of the sun's shadow frustum, metres. Larger = softer, cheaper-looking shadows. */
  shadowExtent: number;
  shadowMapSize: number;
}

/** One moment of sky, as the lighting controller describes it. */
export interface SkyLook {
  /** The shadow-casting light: where it is, what colour, how strong. */
  lightElevation: number;
  lightAzimuth: number;
  lightColour: Color;
  lightIntensity: number;
  /** How soft its shadows are (radius in shadow-map texels). */
  shadowSoftness: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  fogColour: Color;
  fogDensity: number;
  /** Image-based light from the evening sky, turned down as night falls. */
  envIntensity: number;
  /** Sky shader: its own colours, then a tint that takes it down to night. */
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  skyTint: Color;
  /** What the sky shader uses as its sun: the real one, or the moon. */
  skyBodyIsMoon: boolean;
  starOpacity: number;
  moonOpacity: number;
  /** Tone mapping, so a dark night is still readable. */
  exposure: number;
}

export interface Environment {
  sun: DirectionalLight;
  sunDir: Vector3;
  /** Toward the moon (unit) — moves as the moon rises; moonbeams and shaders read it. */
  moonDir: Vector3;
  hemi: HemisphereLight;
  /** Keeps the shadow frustum centred on the player for crisp shadows where they matter. */
  follow(target: Vector3): void;
  /** Applies a moment of sky. */
  setLook(look: SkyLook): void;
  dispose(): void;
}

export const EVENING: EnvironmentOptions = {
  sunElevation: 7,
  sunAzimuth: 250,
  moonAzimuth: 105,
  moonRiseElevation: 3,
  moonHighElevation: 40,
  fogDensity: 0.0115,
  shadowExtent: 26,
  shadowMapSize: 2048,
};

/** Radius of the night sky's dome — inside the camera's far plane (500 m). */
const DOME = 440;

export function buildEnvironment(scene: Scene, renderer: WebGLRenderer, o: EnvironmentOptions = EVENING): Environment {
  const disposables: Array<{ dispose(): void }> = [];
  const dirFrom = (elev: number, az: number, out = new Vector3()) => out.setFromSphericalCoords(1, MathUtils.degToRad(90 - elev), MathUtils.degToRad(az));
  const sunDir = dirFrom(o.sunElevation, o.sunAzimuth);
  const moonDir = dirFrom(o.moonHighElevation, o.moonAzimuth);

  const sky = new Sky();
  sky.scale.setScalar(4000);
  const skyTint = tameSun(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 10;
  u.rayleigh.value = 2.8;
  u.mieCoefficient.value = 0.0045;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);

  // Image-based light from the evening sky, so every material agrees with the horizon. At night it
  // is turned down and the hemisphere light carries the moon's colour instead.
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Group();
  const envSky = new Sky();
  envSky.scale.setScalar(4000);
  tameSun(envSky);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) envSky.material.uniforms[k].value = u[k].value;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(envSky);
  const env: Texture = pmrem.fromScene(envScene as unknown as Scene, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.4;
  pmrem.dispose();
  envSky.geometry.dispose();
  envSky.material.dispose();
  disposables.push(env);

  const fog = new FogExp2(new Color('#7a6070'), o.fogDensity);
  scene.fog = fog;

  const sun = new DirectionalLight('#ffa860', 1.75);
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
  const hemi = new HemisphereLight('#7d88bd', '#5a3f2a', 0.52);
  scene.add(hemi);

  // The night sky's furniture. There is deliberately no mist here: flat sheets laid over the
  // village read as a milky slab across the middle of the screen the moment the moon is up, and
  // the exponential fog already gives the night its depth.
  const heavens = new Group();
  heavens.name = 'Heavens';
  const stars = starField();
  const moon = moonDisc();
  heavens.add(stars, moon);
  heavens.visible = false;
  scene.add(heavens);
  disposables.push(stars.geometry, stars.material as PointsMaterial, ...discDisposables(moon));

  const lightDir = sunDir.clone();
  const snapped = new Vector3();
  const moonPos = new Vector3();

  return {
    sun,
    sunDir,
    moonDir,
    hemi,
    follow(target: Vector3) {
      // Snap to whole shadow texels so edges do not crawl as the player walks. The map's size
      // can change mid-run (the PerformanceManager), so the texel is read, not remembered.
      const texel = (o.shadowExtent * 2) / sun.shadow.mapSize.x;
      snapped.set(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(lightDir, 60);
      // The sky's furniture travels with the player: always at the same great distance.
      heavens.position.set(target.x, 0, target.z);
    },

    setLook(look: SkyLook) {
      dirFrom(look.lightElevation, look.lightAzimuth, lightDir);
      sun.color.copy(look.lightColour);
      sun.intensity = look.lightIntensity;
      sun.shadow.radius = look.shadowSoftness;
      sun.position.copy(sun.target.position).addScaledVector(lightDir, 60);

      hemi.color.copy(look.hemiSky);
      hemi.groundColor.copy(look.hemiGround);
      hemi.intensity = look.hemiIntensity;

      fog.color.copy(look.fogColour);
      fog.density = look.fogDensity;
      scene.environmentIntensity = look.envIntensity;
      renderer.toneMappingExposure = look.exposure;

      u.turbidity.value = look.turbidity;
      u.rayleigh.value = look.rayleigh;
      u.mieCoefficient.value = look.mieCoefficient;
      u.mieDirectionalG.value = look.mieDirectionalG;
      // The sky glows around whichever body is up — the sun, and after the hand-over the moon.
      dirFrom(look.lightElevation, look.lightAzimuth, u.sunPosition.value);
      skyTint.value.copy(look.skyTint);

      // Where the moon actually is: the light's own direction once it is the moon, otherwise
      // just clearing the eastern horizon while the sun finishes in the west.
      if (look.skyBodyIsMoon) dirFrom(look.lightElevation, look.lightAzimuth, moonDir);
      else dirFrom(o.moonRiseElevation, o.moonAzimuth, moonDir);
      moon.position.copy(moonPos.copy(moonDir).multiplyScalar(DOME - 20));
      moon.lookAt(heavens.position);
      (moon.material as MeshBasicMaterial).opacity = look.moonOpacity;
      for (const c of moon.children) ((c as Mesh).material as MeshBasicMaterial).opacity = look.moonOpacity * 0.5;
      (stars.material as PointsMaterial).opacity = look.starOpacity;
      heavens.visible = look.starOpacity > 0.01 || look.moonOpacity > 0.01;
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
 * The tint on top is how the evening sky is taken down into night.
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
function moonDisc(): Mesh {
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
    grad.addColorStop(0.18, 'rgba(170,190,240,0.32)');
    grad.addColorStop(1, 'rgba(120,140,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
  // ~2.2° across: larger than life, as the moon always looks near the horizon.
  const moon = new Mesh(new PlaneGeometry(16, 16), new MeshBasicMaterial({ map: disc, transparent: true, opacity: 0, depthWrite: false, fog: false, color: new Color(1.6, 1.55, 1.4) }));
  const glow = new Mesh(new PlaneGeometry(110, 110), new MeshBasicMaterial({ map: halo, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: AdditiveBlending }));
  glow.position.set(0, 0, -1);
  moon.add(glow);
  moon.renderOrder = -1;
  glow.renderOrder = -1;
  return moon;
}

function discDisposables(moon: Mesh): Array<{ dispose(): void }> {
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

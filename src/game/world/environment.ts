/**
 * Evening sky, image-based light, fog and the low sun — shared by every scene.
 *
 * The look: Ganesh Chaturthi falls in the monsoon's tail, so the evening air is humid and warm.
 * A sun a few degrees above the western horizon, long shadows, a hazy violet-rose fog, and a cool
 * sky fill so the lamps and diyas read warm against it.
 */
import {
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  type Scene,
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
  fogDensity: number;
  /** Half-width of the sun's shadow frustum, metres. Larger = softer, cheaper-looking shadows. */
  shadowExtent: number;
  shadowMapSize: number;
}

export interface Environment {
  sun: DirectionalLight;
  sunDir: Vector3;
  hemi: HemisphereLight;
  /** Keeps the shadow frustum centred on the player for crisp shadows where they matter. */
  follow(target: Vector3): void;
  dispose(): void;
}

export const EVENING: EnvironmentOptions = {
  sunElevation: 7,
  sunAzimuth: 250,
  fogDensity: 0.0115,
  shadowExtent: 26,
  shadowMapSize: 2048,
};

export function buildEnvironment(scene: Scene, renderer: WebGLRenderer, o: EnvironmentOptions = EVENING): Environment {
  const disposables: Array<{ dispose(): void }> = [];
  const sunDir = new Vector3().setFromSphericalCoords(1, MathUtils.degToRad(90 - o.sunElevation), MathUtils.degToRad(o.sunAzimuth));

  const sky = new Sky();
  sky.scale.setScalar(4000);
  tameSun(sky);
  const u = sky.material.uniforms;
  // Low sun through humid air: a deep orange horizon, a small hot glare, a violet zenith.
  u.turbidity.value = 10;
  u.rayleigh.value = 2.8;
  u.mieCoefficient.value = 0.0045;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);

  // Image-based light from the same sky, so every material agrees with the horizon.
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

  scene.fog = new FogExp2(new Color('#7a6070'), o.fogDensity);

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

  // Snap the shadow camera to texel-sized steps so shadow edges don't crawl as the player walks.
  const texel = (o.shadowExtent * 2) / o.shadowMapSize;
  const snapped = new Vector3();
  return {
    sun,
    sunDir,
    hemi,
    follow(target: Vector3) {
      snapped.set(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(sunDir, 60);
    },
    dispose() {
      scene.remove(sky, sun, sun.target, hemi);
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
 */
function tameSun(sky: Sky): void {
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    'gl_FragColor = vec4( min( texColor, vec3( 1.7 ) ), 1.0 );',
  );
  sky.material.needsUpdate = true;
}

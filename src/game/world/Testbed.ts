import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Quaternion,
  RepeatWrapping,
  type Scene,
  SphereGeometry,
  SpriteMaterial,
  Sprite,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
  type WebGLRenderer,
  AdditiveBlending,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Physics } from '../core/Physics';
import type { IInteractable } from '../interaction/IInteractable';
import { TestDoor, TestPickup, TestShrine } from './testInteractables';
import type { World } from './World';


const ASSETS = `${import.meta.env.BASE_URL}assets/textures`;

/** An evening test ground for the player: sky, low warm sun, fog, PBR ground and a few props to move through. */
export async function buildTestbed(scene: Scene, renderer: WebGLRenderer, physics: Physics): Promise<World> {
  const disposables: Array<{ dispose(): void }> = [];

  // --- Sky and image-based light -------------------------------------------------------------
  const sunElevation = 7; // degrees above the horizon: late golden hour
  const sunAzimuth = 215;
  const sunDir = new Vector3().setFromSphericalCoords(
    1,
    MathUtils.degToRad(90 - sunElevation),
    MathUtils.degToRad(sunAzimuth),
  );
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 7;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Group();
  const envSky = new Sky();
  envSky.scale.setScalar(4000);
  Object.assign(envSky.material.uniforms.sunPosition.value, sunDir);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) {
    envSky.material.uniforms[k].value = u[k].value;
  }
  envScene.add(envSky);
  const env = pmrem.fromScene(envScene as unknown as Scene, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  disposables.push(env);

  scene.fog = new FogExp2(new Color('#8f7383'), 0.014);

  // --- Lights -------------------------------------------------------------------------------
  const sun = new DirectionalLight('#ffb070', 1.7);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -18;
  s.right = 18;
  s.top = 18;
  s.bottom = -18;
  s.near = 1;
  s.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.add(new HemisphereLight('#7c86b6', '#4d3527', 0.3));

  // --- Materials ----------------------------------------------------------------------------
  const loader = new TextureLoader();
  const load = (set: string, map: string, repeat: number, color = false): Promise<Texture> =>
    loader.loadAsync(`${ASSETS}/${set}/${map}.webp`).then((t) => {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      if (color) t.colorSpace = SRGBColorSpace;
      disposables.push(t);
      return t;
    });
  const pbr = async (set: string, repeat: number, tint = '#ffffff') =>
    new MeshStandardMaterial({
      color: tint,
      map: await load(set, 'Color', repeat, true),
      normalMap: await load(set, 'NormalGL', repeat),
      roughnessMap: await load(set, 'Roughness', repeat),
      roughness: 1,
    });
  const [earth, plaster, wood] = await Promise.all([
    pbr('Ground054', 22, '#b98b6c'),
    pbr('Plaster001', 1, '#cdb89a'),
    pbr('Wood049', 1),
  ]);
  disposables.push(earth, plaster, wood);

  // --- Ground -------------------------------------------------------------------------------
  const ground = new Mesh(new PlaneGeometry(90, 90), earth);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  physics.addBox(new Vector3(0, -0.5, 0), new Vector3(90, 1, 90));

  const block = (size: Vector3, center: Vector3, material: MeshStandardMaterial, rotation?: Quaternion) => {
    const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.copy(center);
    if (rotation) mesh.quaternion.copy(rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    physics.addBox(center, size, rotation);
    return mesh;
  };

  // Ramp (12°) and steps to test slopes and step-up.
  const rampTilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(-12));
  block(new Vector3(3, 0.2, 6), new Vector3(-6, 0.55, 10), plaster, rampTilt);
  block(new Vector3(3, 1.25, 3), new Vector3(-6, 0.62, 14.4), plaster);
  for (let i = 0; i < 4; i++) {
    block(new Vector3(3, 0.2 * (i + 1), 0.4), new Vector3(6, 0.1 * (i + 1), 10 + i * 0.4), plaster);
  }
  // A low beam to crouch under.
  block(new Vector3(0.2, 1.4, 0.2), new Vector3(-1.7, 0.7, 9), wood);
  block(new Vector3(0.2, 1.4, 0.2), new Vector3(1.7, 0.7, 9), wood);
  block(new Vector3(3.6, 0.3, 1.6), new Vector3(0, 1.3, 9), wood);

  // --- Interactables ------------------------------------------------------------------------
  const interactables: IInteractable[] = [];

  // Coconut on a low stone.
  const stone = block(new Vector3(0.6, 0.3, 0.6), new Vector3(0, 0.15, 3.2), plaster);
  stone.material = plaster;
  const coconutMat = new MeshStandardMaterial({ color: '#5a3a1f', roughness: 0.9 });
  const coconut = new Mesh(new SphereGeometry(0.11, 20, 16), coconutMat);
  coconut.scale.set(1, 1.15, 1);
  coconut.position.set(0, 0.42, 3.2);
  coconut.castShadow = true;
  scene.add(coconut);
  interactables.push(new TestPickup(coconut, new Vector3(0, 0, 3.2)));

  // Shrine: plinth, a small idol stand-in and a diya that lights when you pray.
  const shrineBase = new Vector3(-4.5, 0, 4.5);
  block(new Vector3(1.2, 0.8, 0.6), shrineBase.clone().add(new Vector3(0, 0.4, 0.5)), plaster);
  const idol = new Mesh(
    new SphereGeometry(0.16, 20, 14),
    new MeshStandardMaterial({ color: '#d9822b', roughness: 0.5, metalness: 0.1 }),
  );
  idol.position.copy(shrineBase).add(new Vector3(0, 0.98, 0.55));
  idol.castShadow = true;
  scene.add(idol);
  const diya = new PointLight('#ff9a3c', 0, 5, 1.6);
  diya.position.copy(shrineBase).add(new Vector3(0.3, 0.95, 0.35));
  scene.add(diya);
  const flame = new Sprite(new SpriteMaterial({ map: glowTexture(), color: '#ffb347', blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  flame.scale.setScalar(0.35);
  flame.position.copy(diya.position);
  scene.add(flame);
  interactables.push(new TestShrine(shrineBase.clone().add(new Vector3(0, 0, -0.1)), diya, flame));

  // Hut wall with a working door.
  const hut = new Group();
  hut.position.set(5, 0, 4.5);
  hut.rotation.y = -Math.PI / 2;
  scene.add(hut);
  const hutQ = hut.quaternion.clone();
  const hutPart = (size: Vector3, local: Vector3) => {
    const world = local.clone().applyQuaternion(hutQ).add(hut.position);
    return block(size, world, plaster, hutQ);
  };
  hutPart(new Vector3(1.6, 2.6, 0.3), new Vector3(-1.25, 1.3, 0));
  hutPart(new Vector3(1.6, 2.6, 0.3), new Vector3(1.25, 1.3, 0));
  hutPart(new Vector3(0.9, 0.5, 0.3), new Vector3(0, 2.35, 0));
  const hinge = new Group();
  hinge.position.set(-0.45, 0, 0.1);
  hut.add(hinge);
  const leaf = new Mesh(new BoxGeometry(0.9, 2.1, 0.06), wood);
  leaf.position.set(0.45, 1.05, 0);
  leaf.castShadow = leaf.receiveShadow = true;
  hinge.add(leaf);
  // The doorway itself is closed to physics; only the door interaction lets you in.
  const doorCollider = physics.addBox(new Vector3(0, 1.05, 0).applyQuaternion(hutQ).add(hut.position), new Vector3(0.9, 2.1, 0.1), hutQ);
  const doorFront = new Vector3(0, 0, 0.3).applyQuaternion(hutQ).add(hut.position);
  interactables.push(new TestDoor(doorFront, hinge, doorCollider));

  return {
    interactables,
    shelter: null,
    spawn: new Vector3(0, 0, 0),
    spawnYaw: 0,
    sun,
    follow(target: Vector3) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDir, 40);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      scene.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
  };
}

/** Soft radial glow for the diya flame. */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,190,90,0.8)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

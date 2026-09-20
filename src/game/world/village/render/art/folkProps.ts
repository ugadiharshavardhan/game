/**
 * What the village's people hold: a broom, the aarti lamp and bell, a brass water pot, a string of
 * marigolds. Each is a few small meshes placed every frame from where the person's own hands and
 * hips are, so the broom really reaches the ground and the thali goes round with the hand.
 */
import {
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Person } from './folk';

export type PropName = 'broom' | 'thali' | 'garland-string' | 'pot';

export interface Prop {
  readonly object: Group;
  /** Called after the person's skeleton has moved this frame. */
  update(person: Person): void;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);
const tmp = new Vector3();
const tmp2 = new Vector3();
const q = new Quaternion();

const brass = () => new MeshStandardMaterial({ color: '#c99a2e', roughness: 0.34, metalness: 0.75 });
const wood = () => new MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.85 });
const straw = () => new MeshStandardMaterial({ color: '#c9a45a', roughness: 0.95 });

function disposeAll(object: Group): void {
  object.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    (m.material as MeshStandardMaterial).dispose();
  });
}

function broom(): Prop {
  const object = new Group();
  const handle = new Mesh(new CylinderGeometry(0.012, 0.014, 1.18, 6).translate(0, 0.59, 0), wood());
  const head = new Mesh(new ConeGeometry(0.1, 0.3, 8, 1, true).translate(0, 0.15, 0), straw());
  head.rotation.x = Math.PI;
  head.position.y = 0.3;
  object.add(handle, head);
  object.traverse((o) => (o.castShadow = true));
  return {
    object,
    update(person) {
      const hand = person.boneWorld('RightHand', tmp);
      const yaw = person.group.rotation.y;
      tmp2.set(Math.sin(yaw), 0, Math.cos(yaw));
      // The broom stands on the ground a little ahead of the sweeping hand, leaning back to it.
      object.position.set(hand.x + tmp2.x * 0.5, person.group.position.y + 0.005, hand.z + tmp2.z * 0.5);
      const lean = tmp.set(hand.x - object.position.x, hand.y - object.position.y, hand.z - object.position.z).normalize();
      object.quaternion.copy(q.setFromUnitVectors(UP, lean));
    },
    dispose: () => disposeAll(object),
  };
}

function thali(): Prop {
  const object = new Group();
  const plate = new Group();
  plate.add(new Mesh(new CylinderGeometry(0.12, 0.1, 0.014, 20), brass()));
  plate.add(new Mesh(new SphereGeometry(0.026, 8, 6).scale(1, 0.55, 1).translate(0, 0.02, 0), brass()));
  plate.add(new Mesh(new SphereGeometry(0.02, 8, 6).scale(0.6, 1.5, 0.6).translate(0, 0.06, 0), new MeshBasicMaterial({ color: '#ffb640' })));
  const bell = new Group();
  bell.add(new Mesh(new ConeGeometry(0.035, 0.07, 10, 1, true).translate(0, -0.035, 0), brass()));
  bell.add(new Mesh(new CylinderGeometry(0.006, 0.006, 0.07, 5).translate(0, 0.035, 0), wood()));
  object.add(plate, bell);
  object.traverse((o) => (o.castShadow = true));
  return {
    object,
    update(person) {
      plate.position.copy(person.boneWorld('RightHand', tmp)).y += 0.045;
      bell.position.copy(person.boneWorld('LeftHand', tmp)).y += 0.02;
      bell.rotation.z = Math.sin(performance.now() / 55) * 0.35;
    },
    dispose: () => disposeAll(object),
  };
}

function pot(): Prop {
  const object = new Group();
  const profile = [
    [0.001, 0], [0.06, 0.005], [0.105, 0.05], [0.125, 0.11], [0.1, 0.17], [0.062, 0.2], [0.07, 0.23], [0.085, 0.25],
  ].map(([x, y]) => new Vector2(x, y));
  object.add(new Mesh(new LatheGeometry(profile, 16), brass()));
  object.add(new Mesh(new SphereGeometry(0.06, 10, 8).translate(0, 0.28, 0), new MeshStandardMaterial({ color: '#6a4a2c', roughness: 0.9 })));
  object.traverse((o) => (o.castShadow = true));
  return {
    object,
    update(person) {
      // On the hip, held by the left hand: out to her left and a little forward (character frame).
      const hips = person.boneWorld('Hips', tmp);
      const yaw = person.group.rotation.y;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      object.position.set(hips.x + 0.27 * c + 0.06 * s, hips.y - 0.16, hips.z - 0.27 * s + 0.06 * c);
    },
    dispose: () => disposeAll(object),
  };
}

const BEADS = 16;

function garlandString(): Prop {
  const object = new Group();
  const mesh = new InstancedMesh(new SphereGeometry(0.02, 6, 4).scale(1, 0.7, 1), new MeshStandardMaterial({ color: '#f08a10', roughness: 0.8 }), BEADS);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  object.add(mesh);
  const m = new Matrix4();
  const a = new Vector3();
  const b = new Vector3();
  return {
    object,
    update(person) {
      person.boneWorld('LeftHand', a);
      person.boneWorld('RightHand', b);
      // Marigolds threaded between the hands, hanging in a curve: longer the further apart they are.
      const sag = 0.09 + a.distanceTo(b) * 0.4;
      for (let i = 0; i < BEADS; i++) {
        const t = i / (BEADS - 1);
        tmp.lerpVectors(a, b, t);
        tmp.y -= Math.sin(Math.PI * t) * sag;
        m.makeTranslation(tmp.x, tmp.y, tmp.z);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    },
  };
}

export function makeProp(name: PropName): Prop {
  switch (name) {
    case 'broom':
      return broom();
    case 'thali':
      return thali();
    case 'pot':
      return pot();
    case 'garland-string':
      return garlandString();
  }
}

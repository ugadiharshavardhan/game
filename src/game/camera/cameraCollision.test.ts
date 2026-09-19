/**
 * Camera collision against real Rapier geometry — the walls, corners, alleys, beams and eaves a
 * village is made of. Every orientation, every frame, the camera sphere must be outside solid
 * geometry and the safety net must never have been needed.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CAMERA_QUERY, groups, Layer, Physics } from '../core/Physics';
import { type CameraConfig, DEFAULT_CAMERA_CONFIG } from './CameraConfig';
import { wrapAngle } from './cameraMath';
import { type CameraInput, type CameraTarget, ThirdPersonCamera } from './ThirdPersonCamera';

const DEG = Math.PI / 180;
const DT = 1 / 60;

beforeAll(async () => {
  await RAPIER.init();
});

type Build = (p: Physics) => void;

interface Rig {
  physics: Physics;
  target: CameraTarget & { feet: Vector3; yaw: number; bodyHeight: number; planarSpeed: number; gait: CameraTarget['gait']; fade: number };
  input: { -readonly [K in keyof CameraInput]: CameraInput[K] };
  camera: PerspectiveCamera;
  cam: ThirdPersonCamera;
  config: CameraConfig;
}

function makeRig(build: Build, feet: Vector3, opts: { yaw?: number; crouched?: boolean; config?: Partial<CameraConfig> } = {}): Rig {
  const physics = new Physics(RAPIER);
  physics.addBox(new Vector3(0, -0.5, 0), new Vector3(200, 1, 200)); // ground
  build(physics);
  const bodyHeight = opts.crouched ? 1.05 : 1.62;
  const radius = 0.28;
  const collider = physics.world.createCollider(
    RAPIER.ColliderDesc.capsule(bodyHeight / 2 - radius, radius)
      .setTranslation(feet.x, feet.y + bodyHeight / 2, feet.z)
      .setCollisionGroups(groups(Layer.Player, 0xffff)),
  );
  physics.step(DT);
  const target = {
    feet: feet.clone(),
    yaw: opts.yaw ?? 0,
    bodyHeight,
    planarSpeed: 0,
    gait: (opts.crouched ? 'sneak' : 'normal') as CameraTarget['gait'],
    collider,
    fade: 1,
    setCameraFade(a: number) {
      this.fade = a;
    },
  };
  const input = {
    look: { x: 0, y: 0 },
    lookStick: { x: 0, y: 0 },
    touchLook: false,
    zoomNotches: 0,
    pinchPixels: 0,
    padZoom: 0,
    lookSource: null as CameraInput['lookSource'],
    recenterPressed: false,
  };
  const config = { ...DEFAULT_CAMERA_CONFIG, ...opts.config };
  const camera = new PerspectiveCamera(config.fov, 16 / 9, config.nearPlane, 500);
  const cam = new ThirdPersonCamera(camera, target, input, physics, config);
  return { physics, target, input, camera, cam, config };
}

/** The invariant: the camera is never inside world geometry, and the safety net was never needed. */
function expectClear(r: Rig, label: string): void {
  const inside = r.physics.overlapsSphere(r.camera.position, r.config.collisionRadius * 0.95, CAMERA_QUERY);
  if (inside) throw new Error(`camera inside geometry: ${label} at ${r.camera.position.toArray().map((n) => n.toFixed(2))}`);
  if (r.cam.stats.safetyFixes > 0) throw new Error(`safety net fired: ${label}`);
}

/** Sweep every yaw/pitch, several frames each (so damping and recovery are exercised), checking every frame. */
function sweepAll(r: Rig, name: string, yawStepDeg = 15): number {
  let frames = 0;
  const pitches = [r.config.pitchMinDeg, -12, r.config.defaultPitchDeg, 35, r.config.pitchMaxDeg];
  for (let yawDeg = 0; yawDeg < 360; yawDeg += yawStepDeg) {
    for (const p of pitches) {
      r.cam.setOrientation(yawDeg * DEG, p * DEG); // damped, not cut: the in-between frames are tested too
      for (let f = 0; f < 6; f++) {
        r.cam.update(DT);
        expectClear(r, `${name} yaw ${yawDeg} pitch ${p} frame ${f}`);
        frames++;
      }
    }
  }
  return frames;
}

const q = (deg: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), deg * DEG);

// ---- scenario geometry -------------------------------------------------------------------------

const SCENARIOS: Array<{ name: string; feet: Vector3; build: Build; crouched?: boolean }> = [
  {
    name: 'back against a house wall',
    feet: new Vector3(0, 0, 0),
    build: (p) => p.addBox(new Vector3(0, 1.5, -0.6), new Vector3(8, 3, 0.4)),
  },
  {
    name: 'narrow alley (1.6 m)',
    feet: new Vector3(0, 0, 0),
    build: (p) => {
      p.addBox(new Vector3(-1.0, 1.6, 0), new Vector3(0.4, 3.2, 20));
      p.addBox(new Vector3(1.0, 1.6, 0), new Vector3(0.4, 3.2, 20));
    },
  },
  {
    name: 'inside corner of two walls',
    feet: new Vector3(0, 0, 0),
    build: (p) => {
      p.addBox(new Vector3(-0.7, 1.5, 2), new Vector3(0.3, 3, 8));
      p.addBox(new Vector3(2, 1.5, -0.7), new Vector3(8, 3, 0.3));
    },
  },
  {
    name: 'outside corner of a house',
    feet: new Vector3(0.45, 0, 0.45),
    build: (p) => p.addBox(new Vector3(-2, 1.5, -2), new Vector3(4, 3, 4)),
  },
  {
    name: 'standing in a doorway',
    feet: new Vector3(0, 0, 0),
    build: (p) => {
      // Wall along x with a 1 m gap at the origin, and a lintel over it.
      p.addBox(new Vector3(-2.75, 1.5, 0), new Vector3(4.5, 3, 0.3));
      p.addBox(new Vector3(2.75, 1.5, 0), new Vector3(4.5, 3, 0.3));
      p.addBox(new Vector3(0, 2.6, 0), new Vector3(1, 0.8, 0.3));
    },
  },
  {
    name: 'inside a small room',
    feet: new Vector3(0, 0, 0),
    build: (p) => {
      p.addBox(new Vector3(0, 1.4, -1.6), new Vector3(3.6, 2.8, 0.2));
      p.addBox(new Vector3(0, 1.4, 1.6), new Vector3(3.6, 2.8, 0.2));
      p.addBox(new Vector3(-1.7, 1.4, 0), new Vector3(0.2, 2.8, 3.2));
      p.addBox(new Vector3(1.7, 1.4, 0), new Vector3(0.2, 2.8, 3.2));
      p.addBox(new Vector3(0, 2.9, 0), new Vector3(3.6, 0.2, 3.6)); // ceiling
    },
  },
  {
    name: 'under a low veranda eave',
    feet: new Vector3(0, 0, 0),
    build: (p) => {
      p.addBox(new Vector3(0, 1.5, -1.2), new Vector3(8, 3, 0.4));
      p.addBox(new Vector3(0, 2.35, -0.2), new Vector3(8, 0.12, 2.4), q(0).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 14 * DEG)));
    },
  },
  {
    name: 'beside a pillar and a thin post',
    feet: new Vector3(0, 0, 0),
    build: (p) => {
      p.addCylinder(new Vector3(0, 1.5, -0.9), 1.5, 0.25);
      p.addCylinder(new Vector3(0.6, 1.2, -1.8), 1.2, 0.06);
    },
  },
  {
    name: 'crouched under a low beam',
    feet: new Vector3(0, 0, 0),
    crouched: true,
    build: (p) => {
      p.addBox(new Vector3(0, 1.3, 0), new Vector3(3.6, 0.3, 1.6));
      p.addBox(new Vector3(0, 1.5, -1.5), new Vector3(3.6, 3, 0.3));
    },
  },
  {
    name: 'on steps beside a wall',
    feet: new Vector3(0, 0.45, 0.2),
    build: (p) => {
      for (let i = 0; i < 3; i++) p.addBox(new Vector3(0, 0.075 + i * 0.15, 1.2 - i * 0.35), new Vector3(2, 0.15 + i * 0.3, 0.35));
      p.addBox(new Vector3(0, 0.225, -0.6), new Vector3(3, 0.45, 1.8)); // plinth
      p.addBox(new Vector3(-1.2, 1.9, 0), new Vector3(0.3, 3.8, 4));
    },
  },
  {
    name: 'rotated walls (45°) in a tight wedge',
    feet: new Vector3(0, 0, 0),
    build: (p) => {
      p.addBox(new Vector3(-0.8, 1.5, -0.8), new Vector3(6, 3, 0.3), q(45));
      p.addBox(new Vector3(0.8, 1.5, -0.8), new Vector3(6, 3, 0.3), q(-45));
    },
  },
  {
    name: 'under a sloped roof overhang (convex hull)',
    feet: new Vector3(0, 0, 0.3),
    build: (p) => {
      p.addBox(new Vector3(0, 1.4, -2.5), new Vector3(6, 2.8, 4));
      p.addConvexHull([
        new Vector3(-3.5, 2.6, 0.9), new Vector3(3.5, 2.6, 0.9), new Vector3(-3.5, 4.2, -2.5), new Vector3(3.5, 4.2, -2.5),
        new Vector3(-3.5, 2.8, 0.9), new Vector3(3.5, 2.8, 0.9), new Vector3(-3.5, 4.4, -2.5), new Vector3(3.5, 4.4, -2.5),
      ]);
    },
  },
];

describe('camera collision: full orientation sweeps', () => {
  it.each(SCENARIOS)('$name — never inside geometry', ({ name, feet, build, crouched }) => {
    const r = makeRig(build, feet, { crouched });
    expectClear(r, `${name} after spawn`);
    const frames = sweepAll(r, name);
    expect(frames).toBe(24 * 5 * 6); // 24 yaws × 5 pitches × 6 frames, every one checked
  });

  it('the same sweeps hold at maximum zoom and while running', () => {
    for (const s of SCENARIOS) {
      const r = makeRig(s.build, s.feet, { crouched: s.crouched });
      r.target.gait = s.crouched ? 'sneak' : 'run';
      r.input.zoomNotches = 50; // far past zoomMax — must clamp
      r.cam.update(DT);
      r.input.zoomNotches = 0;
      sweepAll(r, `${s.name} (zoomed out, ${r.target.gait})`, 30);
    }
  });
});

describe('camera collision: motion', () => {
  it('a 180° snap turn against a wall never shows the wall for a single frame', () => {
    const r = makeRig((p) => p.addBox(new Vector3(0, 1.5, 0.7), new Vector3(8, 3, 0.4)), new Vector3(0, 0, 0), { yaw: Math.PI });
    for (let f = 0; f < 30; f++) {
      r.cam.update(DT);
      expectClear(r, `settle ${f}`);
    }
    r.cam.setOrientation(0, 10 * DEG, true); // camera now wants to be *inside* the wall
    r.cam.update(DT);
    expectClear(r, 'first frame after the cut');
    expect(r.cam.stats.boom).toBeLessThan(r.cam.stats.desired);
  });

  it('walking the length of a wall with the camera trailing — every frame clear', () => {
    const r = makeRig((p) => p.addBox(new Vector3(0, 1.5, -0.75), new Vector3(40, 3, 0.4)), new Vector3(-15, 0, 0), { yaw: Math.PI / 2 });
    r.cam.setOrientation(Math.PI / 2 - 0.6, 5 * DEG, true); // looking along the wall, camera swung toward it
    r.target.planarSpeed = 5;
    r.target.gait = 'run';
    for (let f = 0; f < 60 * 6; f++) {
      r.target.feet.x += 5 * DT;
      r.cam.update(DT);
      expectClear(r, `run frame ${f}`);
    }
  });

  it('rounding a corner while running — every frame clear', () => {
    const r = makeRig((p) => p.addBox(new Vector3(-3, 1.5, -3), new Vector3(6, 3, 6)), new Vector3(-3, 0, 0.6), { yaw: Math.PI / 2 });
    r.target.gait = 'run';
    r.target.planarSpeed = 5;
    for (let f = 0; f < 120; f++) {
      // Along the south face, then turn north up the east face.
      if (r.target.feet.x < 0.6) r.target.feet.x += 5 * DT;
      else {
        r.target.feet.z -= 5 * DT;
        r.target.yaw = Math.PI;
      }
      r.cam.update(DT);
      expectClear(r, `corner frame ${f}`);
    }
  });

  it('pulls in when obstructed and eases back out when clear (not a snap)', () => {
    const r = makeRig((p) => p.addBox(new Vector3(0, 1.5, -1.2), new Vector3(8, 3, 0.4)), new Vector3(0, 0, 0));
    r.cam.update(DT);
    expect(r.cam.stats.boom).toBeLessThan(1.2);
    // Step the player away from the wall: boom should recover gradually.
    r.target.feet.z = 6;
    const booms: number[] = [];
    for (let f = 0; f < 90; f++) {
      r.cam.update(DT);
      booms.push(r.cam.stats.boom);
    }
    expect(booms[1] - booms[0]).toBeLessThan(1); // no single-frame jump out
    expect(booms.at(-1)).toBeCloseTo(r.cam.stats.desired, 1);
  });

  it('fades the player out as the camera closes in, and back in when it pulls away', () => {
    const r = makeRig((p) => p.addBox(new Vector3(0, 1.5, -0.45), new Vector3(8, 3, 0.2)), new Vector3(0, 0, 0));
    r.cam.setOrientation(0, 0, true);
    r.cam.update(DT);
    expect(r.target.fade).toBeLessThan(1);
    r.target.feet.z = 8;
    for (let f = 0; f < 120; f++) r.cam.update(DT);
    expect(r.target.fade).toBe(1);
  });

  it('a thin post behind the player does not yank the camera (Prop layer)', () => {
    const open = makeRig(() => {}, new Vector3(0, 0, 0));
    const post = makeRig((p) => p.addCylinder(new Vector3(0, 1.2, -1.6), 1.2, 0.05, Layer.Prop), new Vector3(0, 0, 0));
    open.cam.update(DT);
    post.cam.update(DT);
    expect(post.cam.stats.boom).toBeCloseTo(open.cam.stats.boom, 5);
  });

  it('the invisible map boundary does not pull the camera in (Blocker layer)', () => {
    const r = makeRig((p) => p.addBox(new Vector3(0, 5, -1.2), new Vector3(20, 10, 0.3), undefined, Layer.Blocker), new Vector3(0, 0, 0));
    r.cam.update(DT);
    expect(r.cam.stats.boom).toBeCloseTo(r.cam.stats.desired, 5);
  });
});

describe('camera feel', () => {
  const open = () => makeRig(() => {}, new Vector3(0, 0, 0));
  const settle = (r: Rig, s = 2) => {
    for (let f = 0; f < 60 * s; f++) r.cam.update(DT);
  };

  it('sits behind and slightly above the player by default', () => {
    const r = open();
    settle(r);
    const cam = r.camera.position;
    expect(cam.z).toBeLessThan(-2.5); // player faces +z; camera is behind
    expect(cam.y).toBeGreaterThan(r.config.pivotHeight + 0.3); // above eye height…
    expect(cam.y).toBeLessThan(r.config.pivotHeight + 1.2); // …but only slightly
    expect(r.cam.stats.boom).toBeCloseTo(r.config.distance, 2);
  });

  it('running pulls back and widens the FOV; stopping returns it', () => {
    const r = open();
    settle(r);
    const walkBoom = r.cam.stats.boom;
    const walkFov = r.camera.fov;
    r.target.gait = 'run';
    settle(r);
    expect(r.cam.stats.boom).toBeGreaterThan(walkBoom + 0.3);
    expect(r.camera.fov).toBeGreaterThan(walkFov + 3);
    r.target.gait = 'normal';
    settle(r);
    expect(r.cam.stats.boom).toBeCloseTo(walkBoom, 2);
    expect(r.camera.fov).toBeCloseTo(walkFov, 1);
  });

  it('sneaking moves the camera closer and lower', () => {
    const r = open();
    settle(r);
    const standY = r.camera.position.y;
    const standBoom = r.cam.stats.boom;
    r.target.gait = 'sneak';
    r.target.bodyHeight = 1.05;
    settle(r);
    expect(r.cam.stats.boom).toBeLessThan(standBoom - 0.4);
    expect(r.camera.position.y).toBeLessThan(standY - 0.3);
  });

  it('gait framing blends over time, never snaps', () => {
    const r = open();
    settle(r);
    const before = r.cam.stats.desired;
    r.target.gait = 'run';
    r.cam.update(DT);
    expect(r.cam.stats.desired - before).toBeLessThan(0.1);
  });

  it('mouse turns the camera by exactly sensitivity × pixels (no acceleration)', () => {
    const r = makeRig(() => {}, new Vector3(), { config: { rotationDamping: 0 } });
    const yaw0 = r.cam.yaw;
    r.input.look = { x: 100, y: 0 };
    r.cam.update(DT);
    expect(yaw0 - r.cam.yaw).toBeCloseTo(100 * r.config.mouseSensitivity * DEG, 6);
  });

  it('user sensitivity scales look input; invert-Y flips pitch', () => {
    const r = makeRig(() => {}, new Vector3(), { config: { rotationDamping: 0 } });
    r.cam.setUserSettings({ sensitivity: 2, invertY: true });
    const p0 = r.cam.pitch;
    r.input.look = { x: 0, y: 50 };
    r.cam.update(DT);
    expect(r.cam.pitch - p0).toBeCloseTo(-50 * r.config.mouseSensitivity * 2 * DEG, 6);
  });

  it('right stick turns at the configured rate once ramped', () => {
    const r = makeRig(() => {}, new Vector3(), { config: { rotationDamping: 0 } });
    r.input.lookStick = { x: 1, y: 0 };
    r.input.lookSource = 'stick';
    for (let f = 0; f < 60; f++) r.cam.update(DT); // ramp up
    const before = r.cam.yaw;
    r.cam.update(DT);
    const rate = Math.abs(wrapAngle(r.cam.yaw - before)) / DT / DEG;
    expect(rate).toBeCloseTo(r.config.stickYawSpeed, 0);
  });

  it('pitch is clamped to the configured limits', () => {
    const r = makeRig(() => {}, new Vector3(), { config: { rotationDamping: 0 } });
    r.input.look = { x: 0, y: 99999 };
    r.cam.update(DT);
    expect(r.cam.pitch).toBeCloseTo(r.config.pitchMaxDeg * DEG);
    r.input.look = { x: 0, y: -99999 };
    r.cam.update(DT);
    expect(r.cam.pitch).toBeCloseTo(r.config.pitchMinDeg * DEG);
  });

  it('zoom is clamped and damped; disabled zoom ignores the wheel', () => {
    const r = open();
    r.input.zoomNotches = 100;
    r.cam.update(DT);
    r.input.zoomNotches = 0;
    settle(r);
    expect(r.cam.stats.desired).toBeCloseTo(r.config.zoomMax * 1, 1);
    const off = makeRig(() => {}, new Vector3(), { config: { zoomEnabled: false } });
    off.input.zoomNotches = 100;
    settle(off);
    expect(off.cam.stats.desired).toBeCloseTo(off.config.distance, 2);
  });

  it('pinching fingers apart zooms in', () => {
    const r = open();
    r.input.pinchPixels = 120;
    r.cam.update(DT);
    r.input.pinchPixels = 0;
    settle(r);
    expect(r.cam.stats.desired).toBeLessThan(r.config.distance);
  });

  it('smooth follow: trails a moving player, but never beyond maxFollowLag', () => {
    const r = open();
    settle(r);
    const start = r.camera.position.clone();
    r.target.feet.x += 0.5;
    r.cam.update(DT);
    const moved = r.camera.position.x - start.x;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.5); // damped, not locked
    for (let f = 0; f < 120; f++) {
      r.target.feet.x += 8 * DT; // faster than any gait
      r.cam.update(DT);
    }
    const expectedX = r.target.feet.x - r.config.shoulderOffset; // shoulder is to the right (−x at yaw 0)
    expect(Math.abs(r.camera.position.x - expectedX)).toBeLessThanOrEqual(r.config.maxFollowLag + 0.01);
  });

  it('teleports cut instead of gliding across the map', () => {
    const r = open();
    settle(r);
    r.target.feet.set(40, 0, 40);
    r.cam.update(DT);
    expect(r.camera.position.distanceTo(new Vector3(40, 1.5, 40))).toBeLessThan(5);
  });

  it('controller recentering swings behind a moving player; mouse players are left alone', () => {
    for (const source of ['stick', 'mouse'] as const) {
      const r = open();
      r.input.lookSource = source;
      r.target.yaw = 1.2; // player heads off to one side
      r.target.planarSpeed = 2.2;
      settle(r, 5);
      if (source === 'stick') expect(r.cam.yaw).toBeCloseTo(1.2, 1);
      else expect(r.cam.yaw).toBeCloseTo(0, 5);
    }
  });

  it('recentering does not spin the camera when walking toward it', () => {
    const r = open();
    r.input.lookSource = 'stick';
    r.target.yaw = Math.PI; // walking at the camera
    r.target.planarSpeed = 2.2;
    settle(r, 5);
    expect(r.cam.yaw).toBeCloseTo(0, 5);
  });

  it('R3 recenters immediately behind the player', () => {
    const r = open();
    r.target.yaw = -2;
    r.input.recenterPressed = true;
    r.cam.update(DT);
    r.input.recenterPressed = false;
    settle(r, 1);
    expect(r.cam.yaw).toBeCloseTo(-2, 2);
  });
});

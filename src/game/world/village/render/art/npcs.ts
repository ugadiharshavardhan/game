/**
 * The people at their work: garlands hung over the pandal, rangoli drawn, doorsteps swept, the
 * aarti waved before Bappa. Each is a skinned person (folk.ts) standing where the layout puts them
 * and going on with a slow loop of their own — nobody in the village stands as a statue.
 *
 * Culled beyond conversation distance, and a culled person is not updated at all.
 */
import { Vector3 } from 'three';
import { activityOf, kindOf, PROP_FOR } from '../../folkRules';
import { spawn } from './folk';
import type { ArtContext } from './runtime';

export async function build(a: ArtContext): Promise<boolean> {
  if (!a.layout.villagers.length) return true;
  const people = await Promise.all(
    a.layout.villagers.map(async (v) => {
      const kind = kindOf(v);
      const person = await spawn(a, { kind, outfit: v.outfit, grey: v.grey, scale: v.scale });
      const activity = activityOf(v);
      person.group.name = `villager:${v.id}`;
      person.group.userData.task = v.task;
      // Seated people sit on the ground level of whatever they rest on; the pose puts the hips up.
      const seated = activity === 'SitEdge' || activity === 'SitStool' || activity === 'Stringing';
      person.group.position.set(v.x, seated ? 0 : v.y, v.z);
      person.group.rotation.y = v.rot;
      person.play(activity, { randomise: true, fade: 0 });
      const prop = PROP_FOR[activity];
      if (prop) person.hold(prop);
      a.culler.add(person.group, new Vector3(v.x, 0, v.z), 42);
      return person;
    }),
  );
  a.tick.push((dt) => {
    for (const p of people) p.update(dt);
  });
  return true;
}

/**
 * Who does what: the rules that turn a villager's definition into the person drawn and the work
 * they do. Pure — no Three.js — so the level tests can check every villager against them.
 */
import type { Activity } from '../../player/activityClips';
import type { FolkKind, VillagerDef, VillagerPose } from './types';

/** The work a posture suggests, when the layout does not say. */
const BY_POSE: Record<VillagerPose, Activity> = {
  stand: 'Listen',
  talk: 'Talk',
  'arms-up': 'Garland',
  'hold-up': 'HoldUp',
  kneel: 'Rangoli',
  'sit-edge': 'SitEdge',
  'sit-stool': 'SitStool',
  'light-lamp': 'Lamp',
};

export const activityOf = (v: Pick<VillagerDef, 'pose' | 'activity'>): Activity => v.activity ?? BY_POSE[v.pose];
export const kindOf = (v: Pick<VillagerDef, 'kind'>): FolkKind => v.kind ?? 'man';

/** Activities that need someone crouched or seated: they cannot be done standing up, and vice versa. */
export const LOW_ACTIVITIES: readonly Activity[] = ['Rangoli', 'Wipe', 'Stringing', 'SitStool', 'SitEdge'];

/** What a person carries, by activity. Shown as small props in their hands. */
export const PROP_FOR: Partial<Record<Activity, 'broom' | 'thali' | 'garland-string' | 'pot'>> = {
  Sweep: 'broom',
  Aarti: 'thali',
  Stringing: 'garland-string',
  CarryWalk: 'pot',
};

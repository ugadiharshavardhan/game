import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../../player/activityClips';
import { activityOf, kindOf, LOW_ACTIVITIES } from './folkRules';
import { VILLAGE } from './layout';

const people = VILLAGE.villagers;

describe('the village people', () => {
  it('are each somebody: unique, and doing something real', () => {
    expect(new Set(people.map((p) => p.id)).size).toBe(people.length);
    for (const p of people) expect(ACTIVITIES, p.id).toContain(activityOf(p));
  });

  it('include women at their work and a priest at the altar', () => {
    const women = people.filter((p) => kindOf(p) === 'woman');
    expect(women.length).toBeGreaterThanOrEqual(6);
    const jobs = new Set(women.map(activityOf));
    for (const job of ['Sweep', 'Rangoli', 'Wipe', 'Stringing'] as const) expect(jobs.has(job), job).toBe(true);
    const priest = people.find((p) => p.id === 'temple-pujari');
    expect(priest && kindOf(priest)).toBe('pujari');
    expect(priest && activityOf(priest)).toBe('Aarti');
  });

  it('nobody is a statue: every person has work that moves', () => {
    for (const p of people) expect(activityOf(p), p.id).not.toBe('Rest');
  });

  it('kneeling and seated work is done by people who are kneeling or seated', () => {
    for (const p of people) {
      const low = LOW_ACTIVITIES.includes(activityOf(p));
      const posture = p.pose === 'kneel' || p.pose === 'sit-edge' || p.pose === 'sit-stool';
      expect(posture, `${p.id}: ${activityOf(p)} with pose ${p.pose}`).toBe(low);
    }
  });

  it('never stand on top of one another', () => {
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const d = Math.hypot(people[i].x - people[j].x, people[i].z - people[j].z);
        expect(d, `${people[i].id} and ${people[j].id}`).toBeGreaterThan(0.8);
      }
    }
  });
});

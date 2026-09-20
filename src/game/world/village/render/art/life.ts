/**
 * The village's own life: the people still out in the lanes, and the dogs in the dust.
 *
 * Both read the sky through `a.shared` — when the signs come, the lanes empty and the dogs
 * settle — and both are built to cost nothing when nobody is near them.
 */
import { buildNavGrid } from '../../navgrid';
import { buildWalkers } from './life.villagers';
import { buildDogs } from './life.dogs';
import type { ArtModule } from './runtime';

export const build: ArtModule = async (a) => {
  // A coarser grid than the level tests use: villagers and dogs need a lane, not a doorway.
  const grid = buildNavGrid(a.layout, a.level, { cell: 0.4, radius: 0.5 });
  const [walkers, dogs] = [await buildWalkers(a, grid), buildDogs(a, grid)];
  a.tick.push((dt, time) => {
    walkers?.update(dt);
    dogs.update(dt, time);
  });
  return false; // draws no solids of its own: the greybox still covers what it doesn't.
};

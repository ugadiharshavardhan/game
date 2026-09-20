/**
 * What the map is showing right now, kept outside React: the player's position arrives ten times
 * a second, and redrawing a canvas from it should not mean re-rendering a component tree.
 *
 * Listens to the engine's events once, for as long as the page lives; the minimap and the full map
 * read it and subscribe to redraw.
 */
import { EventBus } from '../../shared/EventBus';
import type { MapPlayer, MapSpot } from '../../shared/map';

export const mapState: { spots: MapSpot[]; player: MapPlayer } = { spots: [], player: { x: 0, z: 43, yaw: Math.PI } };

const listeners = new Set<() => void>();

EventBus.on('ui:map-player', (p) => {
  mapState.player = p;
  for (const l of listeners) l();
});
EventBus.on('ui:map-spots', ({ spots }) => {
  mapState.spots = spots;
  for (const l of listeners) l();
});

export function subscribeMap(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

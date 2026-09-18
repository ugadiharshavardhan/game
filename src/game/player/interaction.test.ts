import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_CONFIG } from '../config/playerConfig';
import { PlayerAction } from './PlayerAnimation';
import { type Interactable, type InteractionActor, PlayerInteraction } from './PlayerInteraction';
import { PlayerState, PlayerStateId } from './PlayerState';

function actor(): InteractionActor & { visible: boolean } {
  return { feet: new Vector3(0, 0, 0), yaw: 0, state: new PlayerState(), visible: true, setVisible(v) { this.visible = v; } };
}

function thing(at: Vector3, allowed = true): Interactable & { uses: number } {
  return {
    position: at,
    uses: 0,
    prompt: () => 'Use',
    actionFor: () => PlayerAction.Pickup,
    canInteract: () => allowed,
    interact() { this.uses++; },
  };
}

describe('PlayerInteraction', () => {
  it('targets the interactable in front, not behind', () => {
    const front = thing(new Vector3(0, 0, 1.2));
    const behind = thing(new Vector3(0, 0, -1.0));
    const sys = new PlayerInteraction([behind, front], DEFAULT_PLAYER_CONFIG);
    sys.update(0.2, actor());
    expect(sys.target).toBe(front);
  });

  it('ignores things out of reach', () => {
    const sys = new PlayerInteraction([thing(new Vector3(0, 0, 5))], DEFAULT_PLAYER_CONFIG);
    sys.update(0.2, actor());
    expect(sys.target).toBeNull();
  });

  it('runs begin → midpoint → complete and locks the player meanwhile', () => {
    const a = actor();
    const t = thing(new Vector3(0, 0, 1));
    const sys = new PlayerInteraction([t], DEFAULT_PLAYER_CONFIG);
    sys.update(0.2, a);
    expect(sys.tryBegin(a)).toBe(PlayerAction.Pickup);
    expect(a.state.value).toBe(PlayerStateId.Interacting);
    expect(sys.tryBegin(a)).toBeNull(); // no double-start
    sys.midpoint(a);
    sys.complete(a);
    expect(t.uses).toBe(1);
    expect(a.state.value).toBe(PlayerStateId.Idle);
  });

  it('refuses when the interactable says no', () => {
    const a = actor();
    const sys = new PlayerInteraction([thing(new Vector3(0, 0, 1), false)], DEFAULT_PLAYER_CONFIG);
    sys.update(0.2, a);
    expect(sys.tryBegin(a)).toBeNull();
    expect(a.state.value).toBe(PlayerStateId.Idle);
  });
});

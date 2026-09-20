import { Vector2 } from 'three';
import { EventBus } from '../../shared/EventBus';
import type { InputDevice } from '../../shared/events';

/**
 * One input model over keyboard + mouse (pointer lock), gamepad and touch.
 *
 * Gameplay reads `move`, `look`, `run`, `slow` and the one-frame edges
 * `crouchPressed` / `interactPressed` / `jumpPressed`. Call `update()` at the start of a frame
 * and `endFrame()` at the end.
 */
export class Input {
  /** x = right, y = forward; magnitude 0..1. */
  readonly move = new Vector2();
  /** Look delta this frame in "pixels" (mouse/touch) — camera converts with its sensitivity. */
  readonly look = new Vector2();
  /** Look rate from a gamepad stick this frame, -1..1 per axis (camera scales by deg/s). */
  readonly lookStick = new Vector2();
  /** Mouse-wheel notches this frame; positive zooms out. */
  zoomNotches = 0;
  /** Change in pinch spread this frame, pixels; positive = fingers apart = zoom in. */
  pinchPixels = 0;
  /** Held controller zoom, -1..1; positive zooms out. */
  padZoom = 0;
  /** Which device last turned the camera. Recentering only helps stick and touch players. */
  lookSource: 'mouse' | 'touch' | 'stick' | null = null;
  /** One-frame edge: snap the camera behind the player (R3). */
  recenterPressed = false;
  run = false;
  slow = false;
  crouchPressed = false;
  /** One-frame edge: leave the ground (Space). */
  jumpPressed = false;
  interactPressed = false;
  pointerLocked = false;
  touchLook = false;
  /** The device the player used last — prompts show its button. */
  device: InputDevice = 'keyboard';

  private readonly keys = new Set<string>();
  private readonly pendingLook = new Vector2();
  private readonly touchMove = new Vector2();
  private moveTouchId: number | null = null;
  private stickShown = false;
  private lookTouchId: number | null = null;
  /** A second finger on the look side turns the drag into a pinch. */
  private pinchTouchId: number | null = null;
  private readonly lastPinchTouch = new Vector2();
  private lastPinchSpread = 0;
  private pendingZoomNotches = 0;
  private pendingPinch = 0;
  private readonly touchOrigin = new Vector2();
  private readonly lastLookTouch = new Vector2();
  private padButtons: boolean[] = [];
  private readonly cleanups: Array<() => void> = [];
  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
  ) {
    this.canvas = canvas;
    // On a phone every look is a touch look; let the camera treat it as such from the first frame.
    if (matchMedia('(pointer: coarse)').matches) {
      this.lookSource = 'touch';
      this.device = 'touch';
    }
    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.listen(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.listen(window, 'blur', () => this.keys.clear());
    this.listen(document, 'mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.setDevice('keyboard');
      const m = e as MouseEvent;
      this.pendingLook.x += m.movementX;
      this.pendingLook.y += m.movementY;
    });
    this.listen(
      canvas,
      'wheel',
      (e) => {
        const w = e as WheelEvent;
        w.preventDefault();
        // Pixel-mode wheels report ~100 per notch; line-mode ~3.
        this.pendingZoomNotches += w.deltaMode === 1 ? w.deltaY / 3 : w.deltaY / 100;
      },
      { passive: false },
    );
    this.listen(canvas, 'click', () => {
      if (!this.pointerLocked && !matchMedia('(pointer: coarse)').matches) void canvas.requestPointerLock?.();
    });
    this.listen(document, 'pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      EventBus.emit('ui:pointer-lock', { locked: this.pointerLocked });
    });
    this.listen(canvas, 'touchstart', (e) => this.onTouchStart(e as TouchEvent), { passive: false });
    this.listen(canvas, 'touchmove', (e) => this.onTouchMove(e as TouchEvent), { passive: false });
    this.listen(canvas, 'touchend', (e) => this.onTouchEnd(e as TouchEvent));
    this.listen(canvas, 'touchcancel', (e) => this.onTouchEnd(e as TouchEvent));
    this.cleanups.push(
      EventBus.on('input:action', ({ action }) => {
        if (action === 'interact') this.interactPressed = true;
        else if (action === 'crouch') this.crouchPressed = true;
      }),
    );
  }

  update(): void {
    // The joystick's visual follows the thumb (React draws it; the canvas owns the touch).
    if (this.moveTouchId !== null) {
      EventBus.emit('ui:touch-stick', {
        active: true,
        originX: this.touchOrigin.x,
        originY: this.touchOrigin.y,
        dx: this.touchMove.x * 34,
        dy: -this.touchMove.y * 34,
      });
      this.stickShown = true;
    } else if (this.stickShown) {
      this.stickShown = false;
      EventBus.emit('ui:touch-stick', { active: false, originX: 0, originY: 0, dx: 0, dy: 0 });
    }

    // Keyboard
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
    this.run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.slow = this.keys.has('ControlLeft') || this.keys.has('ControlRight');

    // Touch joystick
    if (this.moveTouchId !== null) this.move.copy(this.touchMove);

    // Mouse / touch look
    this.look.copy(this.pendingLook);
    this.pendingLook.set(0, 0);
    if (this.look.x !== 0 || this.look.y !== 0) this.lookSource = this.touchLook ? 'touch' : 'mouse';
    this.lookStick.set(0, 0);
    this.zoomNotches = this.pendingZoomNotches;
    this.pinchPixels = this.pendingPinch;
    this.pendingZoomNotches = 0;
    this.pendingPinch = 0;
    this.padZoom = 0;

    this.pollGamepad();
  }

  endFrame(): void {
    this.crouchPressed = false;
    this.interactPressed = false;
    this.recenterPressed = false;
    this.jumpPressed = false;
  }

  releasePointer(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  dispose(): void {
    this.releasePointer();
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    // Space scrolls the page and re-presses the last focused button; the game wants it for jump.
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    if (down) {
      this.setDevice('keyboard');
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.crouchPressed = true;
      if (e.code === 'KeyE') this.interactPressed = true;
      if (e.code === 'Space') this.jumpPressed = true;
    } else {
      this.keys.delete(e.code);
    }
  }

  private pollGamepad(): void {
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const lx = dz(pad.axes[0] ?? 0);
    const ly = -dz(pad.axes[1] ?? 0);
    if (lx !== 0 || ly !== 0) {
      this.move.set(lx, ly);
      if (this.move.lengthSq() > 1) this.move.normalize();
    }
    this.lookStick.set(dz(pad.axes[2] ?? 0), dz(pad.axes[3] ?? 0));
    if (this.lookStick.x !== 0 || this.lookStick.y !== 0) this.lookSource = 'stick';
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.padButtons[i];
    if (lx !== 0 || ly !== 0 || this.lookStick.x !== 0 || this.lookStick.y !== 0 || pressed.some((p, i) => p && !this.padButtons[i])) this.setDevice('gamepad');
    if (edge(3)) EventBus.emit('ui:inventory-toggle'); // Y / Triangle
    if (edge(0)) this.interactPressed = true; // A / Cross
    if (edge(1)) this.crouchPressed = true; // B / Circle
    if (pressed[10]) this.run = true; // L3
    if (edge(11)) this.recenterPressed = true; // R3
    if (pressed[12]) this.padZoom -= 1; // D-pad up: zoom in
    if (pressed[13]) this.padZoom += 1; // D-pad down: zoom out
    this.padButtons = pressed;
  }

  private setDevice(d: InputDevice): void {
    if (d === this.device) return;
    this.device = d;
    EventBus.emit('ui:input-device', { device: d });
  }

  // Left half of the screen: floating joystick. Right half: drag to look.
  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.setDevice('touch');
    for (const t of Array.from(e.changedTouches)) {
      const leftHalf = t.clientX < window.innerWidth / 2;
      if (leftHalf && this.moveTouchId === null) {
        this.moveTouchId = t.identifier;
        this.touchOrigin.set(t.clientX, t.clientY);
        this.touchMove.set(0, 0);
      } else if (!leftHalf && this.lookTouchId === null) {
        this.lookTouchId = t.identifier;
        this.lastLookTouch.set(t.clientX, t.clientY);
        this.touchLook = true;
      } else if (!leftHalf && this.pinchTouchId === null) {
        this.pinchTouchId = t.identifier;
        this.lastPinchTouch.set(t.clientX, t.clientY);
        this.lastPinchSpread = this.lastPinchTouch.distanceTo(this.lastLookTouch);
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveTouchId) {
        const maxDeflection = 48;
        const dx = (t.clientX - this.touchOrigin.x) / maxDeflection;
        const dy = -(t.clientY - this.touchOrigin.y) / maxDeflection;
        this.touchMove.set(dx, dy);
        if (this.touchMove.lengthSq() > 1) this.touchMove.normalize();
        if (this.touchMove.length() < 0.12) this.touchMove.set(0, 0);
      } else if (t.identifier === this.lookTouchId) {
        // While pinching, the look finger only feeds the spread — no accidental turning.
        if (this.pinchTouchId === null) {
          this.pendingLook.x += t.clientX - this.lastLookTouch.x;
          this.pendingLook.y += t.clientY - this.lastLookTouch.y;
        }
        this.lastLookTouch.set(t.clientX, t.clientY);
      } else if (t.identifier === this.pinchTouchId) {
        this.lastPinchTouch.set(t.clientX, t.clientY);
      }
    }
    if (this.pinchTouchId !== null && this.lookTouchId !== null) {
      const spread = this.lastPinchTouch.distanceTo(this.lastLookTouch);
      this.pendingPinch += spread - this.lastPinchSpread;
      this.lastPinchSpread = spread;
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveTouchId) {
        this.moveTouchId = null;
        this.touchMove.set(0, 0);
      } else if (t.identifier === this.lookTouchId) {
        // If a pinch finger remains, it becomes the look finger.
        if (this.pinchTouchId !== null) {
          this.lookTouchId = this.pinchTouchId;
          this.lastLookTouch.copy(this.lastPinchTouch);
          this.pinchTouchId = null;
        } else {
          this.lookTouchId = null;
          this.touchLook = false;
        }
      } else if (t.identifier === this.pinchTouchId) {
        this.pinchTouchId = null;
      }
    }
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }
}

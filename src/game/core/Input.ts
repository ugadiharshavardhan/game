import { Vector2 } from 'three';
import { EventBus } from '../../shared/EventBus';

/**
 * One input model over keyboard + mouse (pointer lock), gamepad and touch.
 *
 * Gameplay reads `move`, `look`, `run`, `slow` and the one-frame edges
 * `crouchPressed` / `interactPressed`. Call `update()` at the start of a frame
 * and `endFrame()` at the end.
 */
export class Input {
  /** x = right, y = forward; magnitude 0..1. */
  readonly move = new Vector2();
  /** Look delta this frame in "pixels" (mouse/touch) — camera converts with its sensitivity. */
  readonly look = new Vector2();
  /** Look rate from a gamepad stick this frame, -1..1 per axis (camera scales by deg/s). */
  readonly lookStick = new Vector2();
  run = false;
  slow = false;
  crouchPressed = false;
  interactPressed = false;
  pointerLocked = false;
  touchLook = false;

  private readonly keys = new Set<string>();
  private readonly pendingLook = new Vector2();
  private readonly touchMove = new Vector2();
  private moveTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private readonly touchOrigin = new Vector2();
  private readonly lastLookTouch = new Vector2();
  private padButtons: boolean[] = [];
  private readonly cleanups: Array<() => void> = [];
  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
  ) {
    this.canvas = canvas;
    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.listen(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.listen(window, 'blur', () => this.keys.clear());
    this.listen(document, 'mousemove', (e) => {
      if (!this.pointerLocked) return;
      const m = e as MouseEvent;
      this.pendingLook.x += m.movementX;
      this.pendingLook.y += m.movementY;
    });
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
        else this.crouchPressed = true;
      }),
    );
  }

  update(): void {
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
    this.lookStick.set(0, 0);

    this.pollGamepad();
  }

  endFrame(): void {
    this.crouchPressed = false;
    this.interactPressed = false;
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
    if (e.repeat) return;
    if (down) {
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.crouchPressed = true;
      if (e.code === 'KeyE') this.interactPressed = true;
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
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.padButtons[i];
    if (edge(0)) this.interactPressed = true; // A / Cross
    if (edge(1)) this.crouchPressed = true; // B / Circle
    if (pressed[10]) this.run = true; // L3
    this.padButtons = pressed;
  }

  // Left half of the screen: floating joystick. Right half: drag to look.
  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
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
        this.pendingLook.x += t.clientX - this.lastLookTouch.x;
        this.pendingLook.y += t.clientY - this.lastLookTouch.y;
        this.lastLookTouch.set(t.clientX, t.clientY);
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveTouchId) {
        this.moveTouchId = null;
        this.touchMove.set(0, 0);
      } else if (t.identifier === this.lookTouchId) {
        this.lookTouchId = null;
        this.touchLook = false;
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

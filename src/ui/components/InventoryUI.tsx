import { useEffect, useRef, useState } from 'react';
import type { InputDevice } from '../../shared/events';
import { ITEM_IDS, ITEMS, type InventorySnapshot, type ItemId, stillNeeded } from '../../shared/items';

const COLS = 4;
const SLOTS = 8;

interface InventoryUIProps {
  open: boolean;
  onClose: () => void;
  snapshot: InventorySnapshot;
  icons: Partial<Record<ItemId, string>>;
  device: InputDevice;
}

/** An item's picture: the rendered 3D icon once it exists, its glyph until then. */
export function ItemIcon({ id, icons, className = '' }: { id: ItemId; icons: Partial<Record<ItemId, string>>; className?: string }) {
  const src = icons[id];
  return src ? (
    <img src={src} alt="" draggable={false} className={`pointer-events-none select-none object-contain ${className}`} />
  ) : (
    <span aria-hidden className={`grid place-items-center ${className}`}>
      {ITEMS[id].glyph}
    </span>
  );
}

/**
 * The offerings bag. Slots hold one stack per item kind; the bar shows how full the bag is; the
 * selected slot explains its item and what the puja still needs; the strip below is tonight's puja.
 *
 * Keyboard: arrows / WASD select · I, Tab or Esc close. Controller: D-pad or stick select · B
 * closes (Y toggles, via the engine). Touch: a bottom sheet with thumb-sized slots.
 */
export function InventoryUI({ open, onClose, snapshot, icons, device }: InventoryUIProps) {
  const [selected, setSelected] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const stacks = snapshot.stacks;
  const slots: ({ id: ItemId; quantity: number } | null)[] = Array.from({ length: SLOTS }, (_, i) => stacks[i] ?? null);
  const current = slots[selected];

  const move = (dx: number, dy: number) =>
    setSelected((s) => {
      const col = (s % COLS) + dx;
      const row = Math.floor(s / COLS) + dy;
      const c = Math.min(Math.max(col, 0), COLS - 1);
      const r = Math.min(Math.max(row, 0), SLOTS / COLS - 1);
      return r * COLS + c;
    });

  // Keyboard, while open.
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') move(-1, 0);
      else if (k === 'ArrowRight' || k === 'KeyD') move(1, 0);
      else if (k === 'ArrowUp' || k === 'KeyW') move(0, -1);
      else if (k === 'ArrowDown' || k === 'KeyS') move(0, 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Controller, while open: D-pad or left stick to select (with repeat), B to close.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let last = 0;
    let prevB = true; // ignore a B already held when the bag opened
    const poll = (t: number) => {
      const pad = navigator.getGamepads?.().find((p) => p?.connected);
      if (pad) {
        const b = pad.buttons;
        const x = (b[15]?.pressed ? 1 : 0) - (b[14]?.pressed ? 1 : 0) || (Math.abs(pad.axes[0] ?? 0) > 0.6 ? Math.sign(pad.axes[0]) : 0);
        const y = (b[13]?.pressed ? 1 : 0) - (b[12]?.pressed ? 1 : 0) || (Math.abs(pad.axes[1] ?? 0) > 0.6 ? Math.sign(pad.axes[1]) : 0);
        if ((x || y) && t - last > 180) {
          move(x, y);
          last = t;
        }
        if (!x && !y) last = 0;
        const bNow = !!b[1]?.pressed;
        if (bNow && !prevB) onClose();
        prevB = bNow;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [open, onClose]);

  if (!open) return null;
  const touch = device === 'touch';
  const needed = (id: ItemId) => stillNeeded(id, snapshot.offered);

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-night-950/35 sm:items-center sm:justify-end sm:bg-transparent sm:p-6" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label="Offerings bag"
        onClick={(e) => e.stopPropagation()}
        className="safe-bottom w-full max-w-md animate-[bag-in_200ms_ease-out] rounded-t-3xl border border-night-700 bg-night-900/92 p-5 shadow-2xl shadow-black/50 outline-none backdrop-blur-md sm:w-96 sm:rounded-3xl"
      >
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-xl text-lamp-200">Offerings bag</h2>
          <p className="text-xs tabular-nums text-dusk-400">
            <span className="text-base text-lamp-200">{snapshot.used}</span> / {snapshot.capacity}
          </p>
        </header>

        {/* Capacity: one segment per item the bag holds. */}
        <div className="mt-3 flex gap-0.5" aria-label={`${snapshot.used} of ${snapshot.capacity} carried`}>
          {Array.from({ length: snapshot.capacity }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < snapshot.used ? (snapshot.used >= snapshot.capacity ? 'bg-dusk-400' : 'bg-lamp-400') : 'bg-night-700'}`} />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {slots.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={s ? `${ITEMS[s.id].name}, ${s.quantity}` : 'Empty slot'}
              className={`relative grid aspect-square place-items-center rounded-2xl border transition ${
                i === selected ? 'border-lamp-400 bg-night-800 ring-2 ring-lamp-400/30' : 'border-night-700 bg-night-950/60'
              } ${s ? '' : 'opacity-50'}`}
            >
              {s && (
                <>
                  <ItemIcon id={s.id} icons={icons} className={`${touch ? 'h-14 w-14 text-4xl' : 'h-12 w-12 text-3xl'}`} />
                  <span className="absolute bottom-1 right-1.5 rounded-md bg-night-950/80 px-1.5 text-xs font-semibold tabular-nums text-lamp-200">×{s.quantity}</span>
                </>
              )}
            </button>
          ))}
        </div>

        <section className="mt-4 min-h-[5.5rem] rounded-2xl border border-night-700/80 bg-night-950/50 p-3">
          {current ? (
            <div className="flex gap-3">
              <ItemIcon id={current.id} icons={icons} className="h-14 w-14 shrink-0 text-4xl" />
              <div className="min-w-0">
                <p className="font-display text-lamp-200">
                  {ITEMS[current.id].name} <span className="text-sm text-dusk-400">×{current.quantity}</span>
                </p>
                <p className="mt-1 text-xs leading-snug text-lamp-200/70">{ITEMS[current.id].description}</p>
                <p className="mt-1.5 text-[11px] text-dusk-400">
                  Bappa has {snapshot.offered[current.id]} of {ITEMS[current.id].required}
                  {needed(current.id) > 0 ? ` · offer these at the temple` : ' · complete'}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-5 text-center text-xs text-dusk-400">{stacks.length ? 'An empty slot.' : 'The bag is empty — the village has what the puja needs.'}</p>
          )}
        </section>

        <h3 className="mt-4 text-[10px] uppercase tracking-[0.25em] text-dusk-400">Tonight’s puja</h3>
        <ul className="mt-2 grid grid-cols-7 gap-1">
          {ITEM_IDS.map((id) => {
            const req = ITEMS[id].required;
            const got = snapshot.offered[id];
            const inBag = stacks.find((s) => s.id === id)?.quantity ?? 0;
            const done = got >= req;
            return (
              <li key={id} className="flex flex-col items-center gap-0.5" title={`${ITEMS[id].name}: ${got} offered, ${inBag} in bag, ${req} needed`}>
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${done ? 'bg-lamp-400/20 ring-1 ring-lamp-400/60' : 'bg-night-950/60'}`}>
                  <ItemIcon id={id} icons={icons} className={`h-8 w-8 text-lg ${done || inBag ? '' : 'opacity-40 grayscale'}`} />
                </span>
                <span className={`text-[10px] tabular-nums ${done ? 'text-lamp-400' : 'text-lamp-200/70'}`}>
                  {done ? '✓' : `${got + inBag}/${req}`}
                </span>
              </li>
            );
          })}
        </ul>

        <footer className="mt-4 flex items-center justify-between text-[10px] tracking-wide text-dusk-400">
          <span>{device === 'gamepad' ? 'D-pad select · B close' : touch ? 'Tap a slot to read it' : 'Arrows select · I or Esc close'}</span>
          <button type="button" onClick={onClose} className="rounded-full border border-night-700 px-3 py-1.5 text-lamp-200 transition hover:border-lamp-400 active:scale-95">
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

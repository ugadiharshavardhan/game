import { useCallback, useEffect, useRef, useState } from 'react';
import { EventBus } from './shared/EventBus';
import type { InputDevice } from './shared/events';
import { INVENTORY_CAPACITY, ITEM_IDS, type InventorySnapshot, type ItemId } from './shared/items';
import type { AppState } from './shared/types';
import { MainMenu } from './ui/components/MainMenu';
import { type CameraSettings, PauseOverlay } from './ui/components/PauseOverlay';
import { GameCanvas } from './ui/components/GameCanvas';
import { Hud } from './ui/components/Hud';
import { InventoryUI } from './ui/components/InventoryUI';
import { useGameEvent } from './ui/hooks/useGameEvent';

/**
 * The app-level state machine (GAME_DESIGN.md §3.1).
 *
 * Implements `menu` and `playing`; `briefing`, `results` and `leaderboard`
 * join as their phases land. The 3D engine is mounted only while playing —
 * quitting unmounts `GameCanvas`, which destroys the engine.
 */
const CAMERA_KEY = 'moonlight-seva.camera';
const DEFAULT_CAMERA: CameraSettings = { sensitivity: 1, invertY: false };

const EMPTY_BAG: InventorySnapshot = {
  capacity: INVENTORY_CAPACITY,
  used: 0,
  stacks: [],
  offered: Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>,
  pujaComplete: false,
};

const initialDevice = (): InputDevice => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');

function loadCameraSettings(): CameraSettings {
  try {
    const raw = localStorage.getItem(CAMERA_KEY);
    return raw ? { ...DEFAULT_CAMERA, ...(JSON.parse(raw) as Partial<CameraSettings>) } : DEFAULT_CAMERA;
  } catch {
    return DEFAULT_CAMERA;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('menu');
  const [paused, setPaused] = useState(false);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(loadCameraSettings);
  const [bagOpen, setBagOpen] = useState(false);
  const bagOpenRef = useRef(false);
  const [bag, setBag] = useState<InventorySnapshot>(EMPTY_BAG);
  const [icons, setIcons] = useState<Partial<Record<ItemId, string>>>({});
  const [device, setDevice] = useState<InputDevice>(initialDevice);

  useGameEvent('ui:inventory', setBag);
  useGameEvent('ui:item-icons', ({ icons: i }) => setIcons(i));
  useGameEvent('ui:input-device', ({ device: d }) => setDevice(d));

  const openBag = useCallback((open: boolean) => {
    if (open === bagOpenRef.current) return;
    bagOpenRef.current = open;
    setBagOpen(open);
    EventBus.emit('game:inventory-open', { open });
    // Free the mouse so the slots can be clicked (this must not read as "pause").
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, []);
  useGameEvent('ui:inventory-toggle', () => openBag(!bagOpenRef.current));

  const changeCamera = useCallback((next: CameraSettings) => {
    setCameraSettings(next);
    EventBus.emit('game:camera-settings', next);
    try {
      localStorage.setItem(CAMERA_KEY, JSON.stringify(next));
    } catch {
      // Private mode or blocked storage: the setting still applies for this session.
    }
  }, []);

  // The engine loads asynchronously; hand it the saved settings once it's up.
  useGameEvent('scene:ready', () => EventBus.emit('game:camera-settings', cameraSettings));

  const startRun = useCallback(() => {
    setPaused(false);
    setBag(EMPTY_BAG);
    setAppState('playing');
  }, []);

  const quitToMenu = useCallback(() => {
    setPaused(false);
    bagOpenRef.current = false;
    setBagOpen(false);
    setAppState('menu');
  }, []);

  // Escape/P toggles pause; losing the tab always pauses. This lives here rather
  // than in the engine because a paused engine stops reading its own input — an
  // engine-side handler could pause the game but never un-pause it.
  useEffect(() => {
    if (appState !== 'playing') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      // The bag: I or Tab; Escape closes it before it would pause.
      if (event.code === 'KeyI' || event.code === 'Tab') {
        event.preventDefault();
        openBag(!bagOpenRef.current);
        return;
      }
      if (event.key === 'Escape' && bagOpenRef.current) {
        openBag(false);
        return;
      }
      if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
        setPaused((value) => !value);
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) setPaused(true);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [appState, openBag]);

  // While the mouse is captured the browser swallows Esc and just releases the
  // pointer, so losing the pointer lock is the desktop "pause" signal.
  useGameEvent('ui:pointer-lock', ({ locked }) => {
    if (!locked && appState === 'playing' && !bagOpenRef.current) setPaused(true);
  });

  // React owns pause state; the engine only obeys. One owner, one direction.
  useEffect(() => {
    if (appState !== 'playing') return;
    EventBus.emit(paused ? 'game:pause' : 'game:resume');
  }, [appState, paused]);

  if (appState === 'menu') {
    return <MainMenu onPlay={startRun} />;
  }

  return (
    <main className="relative h-full w-full overflow-hidden bg-night-950">
      <GameCanvas />
      {!paused && <Hud device={device} snapshot={bag} icons={icons} onOpenBag={() => openBag(true)} />}
      {!paused && <InventoryUI open={bagOpen} onClose={() => openBag(false)} snapshot={bag} icons={icons} device={device} />}

      {/*
        The HUD wrapper is pointer-events-none so that touches pass through to
        the canvas and drive the virtual joystick; only real controls opt back in.
      */}
      {!paused && (
        <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-3">
          <button
            type="button"
            onClick={() => setPaused(true)}
            aria-label="Pause"
            className="pointer-events-auto rounded-lg border border-night-700 bg-night-950/70 px-4 py-2 text-xs uppercase tracking-widest text-lamp-200 backdrop-blur-sm transition hover:border-lamp-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/30"
          >
            Pause
          </button>
        </div>
      )}

      {paused && (
        <PauseOverlay
          onResume={() => setPaused(false)}
          onQuit={quitToMenu}
          camera={cameraSettings}
          onCameraChange={changeCamera}
        />
      )}
    </main>
  );
}

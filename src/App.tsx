import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameOptions } from './game';
import { EventBus } from './shared/EventBus';
import type { InputDevice, PromptInfo } from './shared/events';
import { INVENTORY_CAPACITY, ITEM_IDS, type InventorySnapshot, type ItemId } from './shared/items';
import type { AppState, GameSettings, PlayerStateName, RunResult } from './shared/types';
import { GameCanvas } from './ui/components/GameCanvas';
import { Hud } from './ui/components/Hud';
import { InventoryUI } from './ui/components/InventoryUI';
import { MapOverlay } from './ui/map/MapOverlay';
import { type CameraSettings, PauseOverlay } from './ui/components/PauseOverlay';
import { ResultsScreen } from './ui/components/ResultsScreen';
import { PerfOverlay } from './ui/components/PerfOverlay';
import { TouchControls } from './ui/components/TouchControls';
import { TutorialCard } from './ui/components/TutorialCard';
import { useGameEvent } from './ui/hooks/useGameEvent';
import { MainMenu } from './ui/menu/MainMenu';
import { services, useObservable } from './ui/services';
import { DEFAULT_SETTINGS, withDefaults } from './ui/settings';
import { saveScore } from './ui/leaderboard';

/**
 * The app-level state machine: menu ⇄ playing ⇄ results, with a lobby's session and the short
 * tutorial hanging off the same `playing` state.
 *
 * The 3D engine is mounted only while playing — quitting or finishing unmounts `GameCanvas`,
 * which destroys it; Play again mounts a fresh one (a new `runKey`), so a new run starts from
 * nothing. A team's run carries two extra things into the engine: the session's moon, and the
 * link its teammates' ghosts are drawn from.
 */
const EMPTY_BAG: InventorySnapshot = {
  capacity: INVENTORY_CAPACITY,
  used: 0,
  stacks: [],
  offered: Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>,
  pujaComplete: false,
};

const initialDevice = (): InputDevice => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');

/** One set of services for the whole app, made before the first render. */
const { profiles, teams, session, sync, scores } = services();

export default function App() {
  const [appState, setAppState] = useState<AppState>('menu');
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [bagOpen, setBagOpen] = useState(false);
  const bagOpenRef = useRef(false);
  const [mapOpen, setMapOpen] = useState(false);
  const mapOpenRef = useRef(false);
  const [bag, setBag] = useState<InventorySnapshot>(EMPTY_BAG);
  const [icons, setIcons] = useState<Partial<Record<ItemId, string>>>({});
  const [device, setDevice] = useState<InputDevice>(initialDevice);
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const [playerState, setPlayerState] = useState<PlayerStateName>('idle');
  const [cinematic, setCinematic] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [options, setOptions] = useState<GameOptions>({});
  /** The team round the current run belongs to; null for solo and tutorial runs. */
  const [runSessionId, setRunSessionId] = useState<string | null>(null);
  const runSessionRef = useRef<string | null>(null);
  // What the session subscription needs to know without re-subscribing every render.
  const stateRef = useRef<AppState>('menu');
  const settingsRef = useRef(settings);

  const profile = useObservable(profiles.profile);
  const team = useObservable(teams.snapshot);
  const liveSession = useObservable(session.session);

  useEffect(() => {
    stateRef.current = appState;
    settingsRef.current = settings;
  }, [appState, settings]);

  // The account's saved settings arrive with its profile; a different account brings its own.
  const settingsOwner = useRef<string | null>(null);
  useEffect(() => {
    const owner = profile?.id ?? null;
    if (owner === settingsOwner.current) return;
    settingsOwner.current = owner;
    const next = withDefaults(profile?.settings);
    setSettings(next);
    EventBus.emit('game:settings', next);
    EventBus.emit('game:camera-settings', { sensitivity: next.sensitivity, invertY: next.invertY });
  }, [profile]);

  useGameEvent('ui:inventory', setBag);
  useGameEvent('ui:item-icons', ({ icons: i }) => setIcons(i));
  useGameEvent('ui:input-device', ({ device: d }) => setDevice(d));
  useGameEvent('ui:prompt', setPrompt);
  useGameEvent('ui:player-state', ({ state }) => setPlayerState(state));
  useGameEvent('ui:cinematic', ({ active }) => setCinematic(active));

  const startRun = useCallback(
    (next: GameOptions, sessionId: string | null = null) => {
      setPaused(false);
      setBag(EMPTY_BAG);
      setPrompt(null);
      setResult(null);
      setCinematic(false);
      scores.clear();
      setOptions(next);
      runSessionRef.current = sessionId;
      setRunSessionId(sessionId);
      setRunKey((k) => k + 1);
      setAppState('playing');
    },
    [],
  );

  // A finished run: the database scores it, and its word is what the results screen shows.
  useGameEvent('run:completed', (r) => {
    setResult(r);
    setBagOpen(false);
    bagOpenRef.current = false;
    setMapOpen(false);
    mapOpenRef.current = false;
    setAppState('results');
    const sessionId = runSessionRef.current;
    if (sessionId) session.finish(sessionId);

    // Persist run locally so it immediately appears on the leaderboard
    try {
      saveScore({
        displayName: profile?.displayName || 'Devotee',
        campus: profile?.campus || '',
        score: Math.round(r.breakdown.total),
        durationMs: r.stats.durationMs,
        complete: r.stats.pujaComplete,
        items: r.stats.itemsCollected,
        playedAt: Date.now(),
        teamId: sessionId,
      });
    } catch {
      // Local storage fallback
    }

    if (profile) void scores.submit(sessionId, r);
  });

  // The host pressed start (or this player refreshed mid-round): everyone on the menu walks into
  // the team's round, in the same village under the same moon.
  useEffect(() => {
    if (appState !== 'menu' || !liveSession) return;
    startRun({ session: session.clock() ?? undefined, link: sync, quality: settingsRef.current.quality, character: profile?.character ?? 'devotee' }, liveSession.id);
  }, [appState, liveSession, startRun, profile]);

  const openBag = useCallback((open: boolean) => {
    if (open === bagOpenRef.current) return;
    bagOpenRef.current = open;
    setBagOpen(open);
    EventBus.emit('game:inventory-open', { open });
    // Free the mouse so the slots can be clicked (this must not read as "pause").
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, []);
  useGameEvent('ui:inventory-toggle', () => openBag(!bagOpenRef.current));

  const openMap = useCallback((open: boolean) => {
    if (open === mapOpenRef.current) return;
    mapOpenRef.current = open;
    setMapOpen(open);
    EventBus.emit('game:map-open', { open });
    // Free the mouse so the map's buttons can be clicked (this must not read as "pause").
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, []);

  const changeSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    profiles.saveSettings(next);
    EventBus.emit('game:settings', next);
    EventBus.emit('game:camera-settings', { sensitivity: next.sensitivity, invertY: next.invertY });
  }, []);
  const cameraSettings: CameraSettings = { sensitivity: settings.sensitivity, invertY: settings.invertY };

  // The engine loads asynchronously; hand it the saved settings once it's up.
  useGameEvent('scene:ready', () => {
    EventBus.emit('game:camera-settings', cameraSettings);
    EventBus.emit('game:settings', settings);
  });

  const quitToMenu = useCallback(() => {
    setPaused(false);
    bagOpenRef.current = false;
    setBagOpen(false);
    mapOpenRef.current = false;
    setMapOpen(false);
    setCinematic(false);
    // Quitting a team round part-way: the round no longer waits for this player.
    if (stateRef.current === 'playing' && runSessionRef.current) void session.leave();
    runSessionRef.current = null;
    setRunSessionId(null);
    setAppState('menu');
    sync.clear();
  }, []);

  // A phone held upright plays, but the village is worth seeing wide.
  useEffect(() => {
    if (device !== 'touch') return;
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, [device]);

  // Escape/P toggles pause; losing the tab always pauses. This lives here rather
  // than in the engine because a paused engine stops reading its own input — an
  // engine-side handler could pause the game but never un-pause it.
  useEffect(() => {
    if (appState !== 'playing') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (cinematic) {
        EventBus.emit('game:skip-cinematic');
        return;
      }
      if (event.code === 'KeyM') {
        openBag(false);
        openMap(!mapOpenRef.current);
        return;
      }
      if (event.key === 'Escape' && mapOpenRef.current) {
        openMap(false);
        return;
      }
      if (event.code === 'KeyI' || event.code === 'Tab') {
        event.preventDefault();
        openMap(false);
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
  }, [appState, cinematic, openBag, openMap]);

  // While the mouse is captured the browser swallows Esc and just releases the
  // pointer, so losing the pointer lock is the desktop "pause" signal.
  useGameEvent('ui:pointer-lock', ({ locked }) => {
    if (!locked && appState === 'playing' && !bagOpenRef.current && !mapOpenRef.current && !cinematic) setPaused(true);
  });

  // React owns pause state; the engine only obeys. One owner, one direction.
  useEffect(() => {
    if (appState !== 'playing') return;
    EventBus.emit(paused ? 'game:pause' : 'game:resume');
  }, [appState, paused]);

  if (appState === 'menu') {
    return (
      <MainMenu
        onPlaySolo={() => startRun({ quality: settings.quality, character: profile?.character ?? 'devotee' })}
        onTutorial={() => startRun({ tutorial: true, quality: settings.quality, character: profile?.character ?? 'devotee' })}
        settings={settings}
        onSettings={changeSettings}
      />
    );
  }

  const touch = settings.showTouchControls === 'on' || (settings.showTouchControls === 'auto' && device === 'touch');

  return (
    <main className="relative h-full w-full overflow-hidden bg-night-950">
      {appState === 'playing' && <GameCanvas key={runKey} options={options} />}

      {appState === 'playing' && options.tutorial && !paused && <TutorialCard onPlay={() => startRun({ quality: settings.quality })} onMenu={quitToMenu} />}

      {/* ?perf=1 — frame rate and draw calls, for testing on a real device. */}
      {appState === 'playing' && <PerfOverlay />}

      {appState === 'playing' && !paused && (
        <>
          <Hud device={device} snapshot={bag} icons={icons} onOpenBag={() => openBag(true)} onOpenMap={() => openMap(true)} cinematic={cinematic} />
          {touch && !cinematic && (
            <TouchControls
              onOpenBag={() => openBag(true)}
              onOpenMap={() => openMap(true)}
              onPause={() => setPaused(true)}
              action={prompt ? { verb: prompt.mobileVerb, enabled: prompt.enabled } : null}
              sneaking={playerState === 'sneaking'}
            />
          )}
          {mapOpen && <MapOverlay onClose={() => openMap(false)} />}
          <InventoryUI open={bagOpen} onClose={() => openBag(false)} snapshot={bag} icons={icons} device={device} />
        </>
      )}

      {/* Desktop's pause button; the phone has one in its controls. */}
      {appState === 'playing' && !paused && !touch && !cinematic && (
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

      {cinematic && (
        <button
          type="button"
          onClick={() => EventBus.emit('game:skip-cinematic')}
          className="safe-bottom absolute bottom-6 right-6 z-30 rounded-full border border-lamp-200/25 bg-night-950/50 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-lamp-200/70 backdrop-blur-md transition hover:text-lamp-200"
        >
          Skip
        </button>
      )}

      {portrait && appState === 'playing' && (
        <div className="safe-top pointer-events-none absolute inset-x-0 top-36 z-30 flex justify-center px-6">
          <p className="rounded-full bg-night-950/80 px-4 py-2 text-center text-[11px] text-lamp-200/85 backdrop-blur-md">
            Turn your phone sideways for the full view
          </p>
        </div>
      )}

      {paused && appState === 'playing' && (
        <PauseOverlay onResume={() => setPaused(false)} onQuit={quitToMenu} camera={cameraSettings} onCameraChange={(c) => changeSettings({ ...settings, ...c })} />
      )}

      {appState === 'results' && result && (
        <ResultsScreen
          result={result}
          profile={profile}
          team={team}
          sessionId={runSessionId}
          onPlayAgain={() => startRun(options)}
          onMainMenu={quitToMenu}
        />
      )}
    </main>
  );
}

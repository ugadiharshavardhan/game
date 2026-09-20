import type { GameSettings, QualityLevel } from '../../shared/types';
import { detectQuality } from '../settings';

interface SettingsProps {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onBack: () => void;
  playerName: string;
  onChangeName: () => void;
}

const QUALITY: Array<[QualityLevel, string]> = [
  ['auto', 'Auto'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
];

/** Few knobs, all of them ones a player will actually want on the night. */
export function Settings({ settings, onChange, onBack, playerName, onChangeName }: SettingsProps) {
  const set = (change: Partial<GameSettings>) => onChange({ ...settings, ...change });

  return (
    <div className="w-full max-w-md text-left">
      <Row label="Player">
        <button type="button" onClick={onChangeName} className="rounded-lg border border-night-700 px-3 py-1.5 text-sm text-lamp-200 transition hover:border-lamp-400">
          {playerName || 'Set a name'}
        </button>
      </Row>

      <Row label="Graphics" hint={settings.quality === 'auto' ? `Auto · this device looks like ${detectQuality()}` : undefined}>
        <div className="flex gap-1">
          {QUALITY.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => set({ quality: value })}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition ${settings.quality === value ? 'bg-lamp-400/20 text-lamp-200' : 'text-dusk-400 hover:text-lamp-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Volume">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => set({ volume: Number(e.target.value) })}
          className="w-40 accent-lamp-400"
          aria-label="Volume"
        />
      </Row>

      <Row label="Look sensitivity">
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={settings.sensitivity}
          onChange={(e) => set({ sensitivity: Number(e.target.value) })}
          className="w-40 accent-lamp-400"
          aria-label="Look sensitivity"
        />
      </Row>

      <Row label="Invert look">
        <Toggle on={settings.invertY} onClick={() => set({ invertY: !settings.invertY })} />
      </Row>

      <Row label="Touch controls" hint="On by default when you are playing on a phone.">
        <div className="flex gap-1">
          {(['auto', 'on', 'off'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => set({ showTouchControls: value })}
              className={`rounded-lg px-2.5 py-1.5 text-xs capitalize transition ${settings.showTouchControls === value ? 'bg-lamp-400/20 text-lamp-200' : 'text-dusk-400 hover:text-lamp-200'}`}
            >
              {value}
            </button>
          ))}
        </div>
      </Row>

      <button type="button" onClick={onBack} className="mt-6 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-night-800/70 py-3">
      <span>
        <span className="block text-sm text-lamp-200">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-dusk-400">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`h-6 w-11 rounded-full p-0.5 transition ${on ? 'bg-lamp-400' : 'bg-night-700'}`}
    >
      <span className={`block h-5 w-5 rounded-full bg-night-950 transition ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

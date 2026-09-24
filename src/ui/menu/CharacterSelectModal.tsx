import { useState } from 'react';
import type { CharacterModel, PlayerGender } from '../../shared/multiplayer';
import { CAMPUSES } from './campuses';

interface CharacterSelectModalProps {
  initialName?: string;
  initialGender?: PlayerGender;
  initialCharacter?: CharacterModel;
  initialCampus?: string;
  isGuest?: boolean;
  onConfirm: (name: string, gender: PlayerGender, character: CharacterModel, campus: string) => void;
  onCancel?: () => void;
}

export function CharacterSelectModal({
  initialName = '',
  initialGender = 'male',
  initialCampus = '',
  isGuest = false,
  onConfirm,
  onCancel,
}: CharacterSelectModalProps) {
  const [name, setName] = useState(() => initialName || (isGuest ? 'Guest_Seeker' : ''));
  const [gender, setGender] = useState<PlayerGender>(initialGender);
  const [campus, setCampus] = useState(initialCampus);

  const ready = name.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onConfirm(name.trim(), gender, 'devotee', campus.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl border border-lamp-400/40 bg-gradient-to-b from-night-900/95 via-night-950/95 to-black/95 p-6 shadow-[0_0_50px_rgba(242,196,106,0.18)] sm:p-8">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-lamp-200/20 bg-night-950/70 text-lamp-200 hover:border-lamp-400"
          >
            ✕
          </button>
        )}

        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-lamp-400">Player Profile</p>
          <h2 className="mt-1 font-display text-2xl text-lamp-200 sm:text-3xl">Enter Moonlight Seva</h2>
          <p className="mt-1 text-xs text-dusk-400">Set your player name and campus to begin the Ganesh Chaturthi festival</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">

          {/* Name & Gender inputs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="modal-player-name" className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-dusk-400">
                Player Name <span className="text-lamp-400">*</span>
              </label>
              <input
                id="modal-player-name"
                type="text"
                required
                maxLength={16}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="mt-1.5 w-full rounded-xl border border-night-700 bg-night-950/80 px-4 py-2.5 font-display text-base text-lamp-200 placeholder:text-dusk-400/40 focus:border-lamp-400 focus:outline-none focus:ring-1 focus:ring-lamp-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-dusk-400">
                Gender Identity
              </label>
              <div className="mt-1.5 flex gap-2">
                {(['male', 'female', 'other'] as PlayerGender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`flex-1 rounded-xl border py-2.5 text-xs capitalize transition ${
                      gender === g
                        ? 'border-lamp-400 bg-lamp-400/20 font-semibold text-lamp-200'
                        : 'border-night-700 bg-night-950/60 text-dusk-400 hover:text-lamp-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Campus (optional) */}
          <div>
            <label htmlFor="modal-player-campus" className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-dusk-400">
              Campus / Region <span className="tracking-normal text-dusk-400/60">· optional</span>
            </label>
            <input
              id="modal-player-campus"
              list="modal-campus-list"
              maxLength={24}
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              placeholder="e.g. Hyderabad, Pune, Bengaluru"
              className="mt-1.5 w-full rounded-xl border border-night-700 bg-night-950/80 px-4 py-2.5 text-sm text-lamp-200 placeholder:text-dusk-400/40 focus:border-lamp-400 focus:outline-none focus:ring-1 focus:ring-lamp-400"
            />
            <datalist id="modal-campus-list">
              {CAMPUSES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <button
            type="submit"
            disabled={!ready}
            className="w-full rounded-xl bg-gradient-to-r from-lamp-400 via-lamp-300 to-lamp-400 py-3.5 font-display text-lg tracking-wider text-night-950 shadow-[0_10px_30px_-8px_rgba(242,196,106,0.6)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-night-700 disabled:text-dusk-400 active:scale-[0.99]"
          >
            Enter the Village
          </button>
        </form>
      </div>
    </div>
  );
}

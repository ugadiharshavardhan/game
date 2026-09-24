import { SignInButton, UserButton, useUser } from '@clerk/react';
import { useState } from 'react';
import type { CharacterModel, PlayerGender, PlayerProfile } from '../../shared/multiplayer';
import { CharacterSelectModal } from './CharacterSelectModal';

interface BottomLeftProfileProps {
  profile: PlayerProfile | null;
  onUpdateProfile: (name: string, gender: PlayerGender, character: CharacterModel, campus: string) => void;
  onSignOut: () => void;
}

export function BottomLeftProfile({ profile, onUpdateProfile, onSignOut }: BottomLeftProfileProps) {
  const { isSignedIn, user } = useUser();
  const [openModal, setOpenModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);

  if (!profile) return null;

  const charIcon = '✨';
  const charLabel = 'Devotee';

  return (
    <>
      {/* Bottom-left Profile Card Button */}
      <div className="safe-bottom fixed bottom-4 left-4 z-30">
        <button
          type="button"
          onClick={() => setOpenModal(true)}
          className="group flex items-center gap-3 rounded-2xl border border-lamp-400/30 bg-night-950/80 p-2 pr-4 shadow-[0_4px_24px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all hover:border-lamp-400 hover:bg-night-900/90 active:scale-95"
        >
          {/* Avatar Ring */}
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-lamp-400/25 to-night-800 text-2xl shadow-inner ring-1 ring-lamp-400/40 group-hover:ring-lamp-400">
            <span>{charIcon}</span>
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full border border-night-950 bg-emerald-500" />
            </span>
          </div>

          {/* Profile Info */}
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="max-w-[120px] truncate font-display text-sm font-bold text-lamp-200 group-hover:text-lamp-300 sm:max-w-[160px]">
                {profile.displayName}
              </span>
              <span className="rounded bg-lamp-400/20 px-1 py-0.2 text-[8px] font-bold uppercase tracking-wider text-lamp-300">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-dusk-400">
              {charLabel} {profile.campus ? `· ${profile.campus}` : ''}
            </p>
          </div>
        </button>
      </div>

      {/* Profile Detail Dialog */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl border border-lamp-400/40 bg-gradient-to-b from-night-900 via-night-950 to-black p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setOpenModal(false)}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-lamp-200/20 bg-night-900 text-lamp-200 hover:border-lamp-400"
            >
              ✕
            </button>

            {/* Profile Header */}
            <div className="flex items-center gap-4 border-b border-night-800 pb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-lamp-400/30 to-night-800 text-3xl ring-2 ring-lamp-400/50">
                {charIcon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-display text-xl text-lamp-200">{profile.displayName}</h3>
                  <span className="rounded-full bg-lamp-400/20 px-2 py-0.5 text-[9px] font-semibold uppercase text-lamp-300">
                    {charLabel}
                  </span>
                </div>
                <p className="text-xs text-dusk-400">
                  {profile.gender ? `Gender: ${profile.gender}` : ''} {profile.campus ? `· ${profile.campus}` : ''}
                </p>
                <p className="mt-1 font-mono text-[9px] text-dusk-400/70 truncate">ID: {profile.playerId}</p>
              </div>
            </div>

            {/* Career Stats */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-night-800 bg-night-900/60 p-3 text-center">
                <span className="block text-[10px] uppercase tracking-wider text-dusk-400">Best Score</span>
                <span className="font-display text-xl text-lamp-400">{profile.bestIndividualScore || 0}</span>
              </div>
              <div className="rounded-xl border border-night-800 bg-night-900/60 p-3 text-center">
                <span className="block text-[10px] uppercase tracking-wider text-dusk-400">Runs Completed</span>
                <span className="font-display text-xl text-lamp-200">{profile.gamesPlayed || 0}</span>
              </div>
            </div>

            {/* Clerk Account Status */}
            <div className="mt-4 rounded-xl border border-night-800 bg-night-900/40 p-3">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-dusk-400">Account</span>
              {isSignedIn && user ? (
                <div className="mt-2 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs text-lamp-200 truncate">{user.primaryEmailAddress?.emailAddress}</p>
                    <p className="text-[10px] text-emerald-400">Signed in with Google</p>
                  </div>
                  <UserButton />
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-lamp-200">Playing as Guest</p>
                    <p className="text-[10px] text-dusk-400">Link Google to save scores</p>
                  </div>
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="rounded-lg bg-lamp-400 px-3 py-1.5 text-xs font-semibold text-night-950 transition hover:bg-lamp-300"
                    >
                      Connect
                    </button>
                  </SignInButton>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpenModal(false);
                  setOpenEditModal(true);
                }}
                className="flex-1 rounded-xl border border-lamp-400/40 bg-lamp-400/10 py-2.5 text-xs font-semibold text-lamp-200 transition hover:bg-lamp-400/20"
              >
                Change Avatar / Name
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenModal(false);
                  onSignOut();
                }}
                className="rounded-xl border border-night-700 bg-night-950/70 px-4 py-2.5 text-xs text-dusk-400 transition hover:border-red-400/40 hover:text-red-300"
              >
                Switch User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Avatar / Profile Modal */}
      {openEditModal && (
        <CharacterSelectModal
          initialName={profile.displayName}
          initialGender={profile.gender || 'male'}
          initialCharacter={profile.character || 'devotee'}
          initialCampus={profile.campus || ''}
          onConfirm={(name, gender, character, campus) => {
            setOpenEditModal(false);
            onUpdateProfile(name, gender, character, campus);
          }}
          onCancel={() => setOpenEditModal(false)}
        />
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import type { GameSettings } from '../../shared/types';
import { ClerkSessionBridge } from '../ClerkSessionBridge';
import { services, useObservable } from '../services';
import { AuthWelcomeScreen } from './AuthWelcomeScreen';
import { BottomLeftProfile } from './BottomLeftProfile';
import { Boards } from './Boards';
import { HowToPlay } from './HowToPlay';
import { PujaList } from './PujaList';
import { Settings } from './Settings';
import { CreateTeam, JoinTeam, TeamLobby } from './TeamPanels';

export type MenuPanel = 'home' | 'auth' | 'create' | 'join' | 'lobby' | 'boards' | 'how' | 'puja' | 'settings';

interface MainMenuProps {
  onPlaySolo: () => void;
  onTutorial: () => void;
  settings: GameSettings;
  onSettings: (settings: GameSettings) => void;
}

/**
 * The evening of Ganesh Chaturthi, held still: the village at dusk, the devotee in the foreground,
 * the moon just clearing the trees. Everything in front of it — the name, the team, the boards —
 * is drawn over that one image, so the menu opens instantly and still looks like the game.
 */
export function MainMenu({ onPlaySolo, onTutorial, settings, onSettings }: MainMenuProps) {
  const { profiles, teams, net } = services();
  const profile = useObservable(profiles.profile);
  const team = useObservable(teams.team);
  const networked = useObservable(net.mode) === 'socket';
  const [chosen, setPanel] = useState<MenuPanel>(profile ? 'home' : 'auth');

  // If there's no profile, always show the AuthWelcomeScreen
  const effectivePanel: MenuPanel = !profile ? 'auth' : (team && (chosen === 'home' || chosen === 'create' || chosen === 'join') ? 'lobby' : chosen);

  // The connection is opened once a player has an identity to announce.
  useEffect(() => {
    if (profile) teams.announce(profile);
  }, [profile, teams]);

  const home = () => setPanel('home');

  const dismissible =
    effectivePanel === 'how' ||
    effectivePanel === 'puja' ||
    effectivePanel === 'settings' ||
    effectivePanel === 'boards' ||
    effectivePanel === 'create' ||
    effectivePanel === 'join';

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel('home');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible]);

  if (effectivePanel === 'auth' || !profile) {
    return (
      <>
        <ClerkSessionBridge onSignedOut={() => setPanel('auth')} />
        <AuthWelcomeScreen
          existingProfile={profile}
          onEnterGame={(name, gender, character, campus, clerkUserId) => {
            const p = profiles.signIn(name, campus, clerkUserId, gender, character);
            if (p) {
              teams.announce(p);
              setPanel('home');
            }
          }}
        />
      </>
    );
  }

  return (
    <main className="safe-top safe-bottom relative flex h-full w-full flex-col items-center overflow-y-auto overflow-x-hidden bg-night-950 px-6">
      <ClerkSessionBridge onSignedOut={() => setPanel('auth')} />
      <Backdrop />

      {/* Dedicated Gaming Profile Badge in Bottom-Left */}
      <BottomLeftProfile
        profile={profile}
        onUpdateProfile={(name, gender, character, campus) => {
          const updated = profiles.updateProfile({ displayName: name, gender, character, campus });
          if (updated) teams.announce(updated);
        }}
        onSignOut={() => {
          profiles.signOut();
          setPanel('auth');
        }}
      />

      {dismissible && (
        <button
          type="button"
          onClick={home}
          aria-label="Close"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
          className="fixed right-4 top-4 z-30 grid h-11 w-11 place-items-center rounded-full border border-lamp-200/25 bg-night-950/80 text-xl leading-none text-lamp-200 transition hover:border-lamp-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/30 active:scale-95"
        >
          <span aria-hidden>×</span>
        </button>
      )}

      <div className="relative z-10 my-auto flex w-full max-w-md shrink-0 flex-col items-center py-8">
        <header className={`text-center transition-all duration-700 ${effectivePanel === 'home' ? 'mb-8' : 'mb-5 scale-90 opacity-80'}`}>
          <p className="text-[10px] uppercase tracking-[0.45em] text-dusk-400">Ganesh Chaturthi</p>
          <h1 className="mt-2 font-display text-4xl leading-none text-lamp-200 drop-shadow-[0_4px_24px_rgba(0,0,0,0.55)] sm:text-5xl">Moonlight Seva</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-lamp-200/70">
            Gather the offerings. Follow the moon. Complete the puja.
          </p>
        </header>

        {effectivePanel === 'home' && (
          <nav className="w-full max-w-sm">
            <Primary onClick={onPlaySolo}>Play solo</Primary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Secondary onClick={() => setPanel('create')}>Create team</Secondary>
              <Secondary onClick={() => setPanel('join')}>Join team</Secondary>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Secondary onClick={() => setPanel('how')}>How to play</Secondary>
              <Secondary onClick={() => setPanel('puja')}>Puja list</Secondary>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Secondary onClick={() => setPanel('boards')}>Leaderboard</Secondary>
              <Secondary onClick={() => setPanel('settings')}>Settings</Secondary>
            </div>
            <p className="mt-6 text-center text-[11px] text-dusk-400">
              Playing as <span className="text-lamp-200">{profile?.displayName}</span>
              {profile?.campus ? ` · ${profile.campus}` : ''}
              {' · '}
              <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-lamp-200" onClick={() => setPanel('auth')}>
                change profile
              </button>
            </p>
            {!networked && (
              <p className="mt-2 text-center text-[10px] leading-relaxed text-dusk-400/70">
                No session server: teams play across tabs on this device.
              </p>
            )}
          </nav>
        )}

        {effectivePanel === 'create' && <CreateTeam onBack={home} />}
        {effectivePanel === 'join' && <JoinTeam onBack={home} />}
        {effectivePanel === 'lobby' && <TeamLobby onLeave={home} />}
        {effectivePanel === 'boards' && <Boards onBack={home} />}
        {effectivePanel === 'how' && <HowToPlay onBack={home} onTutorial={onTutorial} />}
        {effectivePanel === 'puja' && <PujaList onBack={home} />}
        {effectivePanel === 'settings' && (
          <Settings settings={settings} onChange={onSettings} onBack={home} playerName={profile?.displayName ?? ''} onChangeName={() => setPanel('auth')} />
        )}
      </div>
    </main>
  );
}

function Primary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl bg-lamp-400 px-8 py-4 font-display text-xl text-night-950 shadow-[0_10px_40px_-12px_rgba(242,196,106,0.7)] transition hover:bg-lamp-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/40 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function Secondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-lamp-200/15 bg-night-950/50 px-4 py-3 text-sm text-lamp-200/90 backdrop-blur-sm transition hover:border-lamp-400/60 hover:text-lamp-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400/25 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

/**
 * The village behind the menu: one photograph of the game, drifting slowly, with the moon coming
 * up behind it and a few motes crossing the light. No 3D, no engine — the menu is on screen
 * before any of that has downloaded.
 */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Through BASE_URL, so the menu still finds its village when the game is served from a
          sub-path (GitHub Pages serves a project at /repo-name/). */}
      <div
        className="menu-drift absolute inset-0 bg-cover bg-[position:32%_center]"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}assets/menu/village-evening.jpg)` }}
      />
      {/* A halo around the moon that is already in the photograph, rising very slowly. */}
      <div className="menu-moonrise absolute left-[74%] top-[14%] h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(255,252,238,0.55)_0%,rgba(226,232,255,0.28)_40%,rgba(150,175,235,0)_72%)]" />
      {/* Warm lamplight breathing at the edges of the frame. */}
      <div className="menu-lamps absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_80%_at_20%_100%,rgba(255,160,60,0.25),transparent_70%),radial-gradient(50%_70%_at_82%_100%,rgba(255,140,50,0.2),transparent_70%)]" />
      {/* Readability: the image is a backdrop, not the content. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,8,16,0.72),rgba(6,8,16,0.45)_35%,rgba(6,8,16,0.88))]" />
      <Motes />
    </div>
  );
}

const MOTE_STYLE = [
  { left: '12%', delay: '0s', duration: '26s', size: 3 },
  { left: '28%', delay: '6s', duration: '32s', size: 2 },
  { left: '47%', delay: '12s', duration: '24s', size: 4 },
  { left: '63%', delay: '3s', duration: '30s', size: 2 },
  { left: '79%', delay: '9s', duration: '28s', size: 3 },
  { left: '91%', delay: '15s', duration: '34s', size: 2 },
];

function Motes() {
  return (
    <div className="absolute inset-0">
      {MOTE_STYLE.map((m, i) => (
        <span
          key={i}
          className="menu-mote absolute bottom-0 rounded-full bg-lamp-200/70"
          style={{ left: m.left, width: m.size, height: m.size, animationDelay: m.delay, animationDuration: m.duration }}
        />
      ))}
    </div>
  );
}

import { SignInButton, useUser } from '@clerk/react';
import { useState } from 'react';
import type { CharacterModel, PlayerGender, PlayerProfile } from '../../shared/multiplayer';
import { CharacterSelectModal } from './CharacterSelectModal';
import { PrivacyPolicyModal, TermsOfServiceModal } from './LegalModals';

interface AuthWelcomeScreenProps {
  existingProfile: PlayerProfile | null;
  onEnterGame: (name: string, gender: PlayerGender, character: CharacterModel, campus: string, clerkUserId?: string) => void;
}

export function AuthWelcomeScreen({ existingProfile, onEnterGame }: AuthWelcomeScreenProps) {
  const { user, isSignedIn } = useUser();
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [agreedAge, setAgreedAge] = useState(true);
  const [showConsentWarning, setShowConsentWarning] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);

  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // If user signs in with Google or chose guest mode, show character select if they don't have a profile yet
  const showSelectModal = guestModalOpen || Boolean(isSignedIn && user && !existingProfile?.displayName);

  const handleGoogleClick = () => {
    if (!agreedTerms || !agreedAge) {
      setShowConsentWarning(true);
      return;
    }
    setShowConsentWarning(false);
  };

  const handleGuestClick = () => {
    if (!agreedTerms || !agreedAge) {
      setShowConsentWarning(true);
      return;
    }
    setShowConsentWarning(false);
    setGuestModalOpen(true);
  };

  const handleModalConfirm = (name: string, gender: PlayerGender, character: CharacterModel, campus: string) => {
    setGuestModalOpen(false);
    const clerkId = guestModalOpen ? undefined : user?.id;
    onEnterGame(name, gender, character, campus, clerkId);
  };

  const googleName = user?.fullName?.trim() || user?.firstName?.trim() || '';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-night-950 font-sans select-none">
      {/* Background Village Image with cinematic dusk gradient */}
      <div
        className="menu-drift absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}assets/menu/village-evening.jpg)` }}
      />

      {/* Atmospheric lighting layers */}
      <div className="menu-moonrise absolute left-[65%] top-[12%] h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,252,238,0.45)_0%,rgba(226,232,255,0.2)_40%,transparent_75%)]" />
      <div className="menu-lamps absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(60%_80%_at_20%_100%,rgba(255,160,60,0.35),transparent_70%),radial-gradient(50%_70%_at_80%_100%,rgba(255,140,50,0.28),transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-night-950/25 to-black/85" />

      {/* Ambient floating motes */}
      <FloatingMotes />

      {/* Top Bar: Version on left, Game Logo / Title on right (Free Fire style) */}
      <div className="safe-top absolute inset-x-0 top-0 z-20 flex items-start justify-between p-6 sm:p-8">
        {/* Version tag (matches top-left tag in screenshot) */}
        <div className="rounded border border-white/20 bg-black/40 px-2.5 py-1 text-xs font-mono font-medium tracking-wider text-white/90 backdrop-blur-sm">
          1.62.6
        </div>

        {/* Title logo (matches top-right logo in screenshot) */}
        <div className="text-right">
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.2em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-3xl">
            MOONLIGHT <span className="text-lamp-400">SEVA</span>
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-lamp-200/80">
            GANESH CHATURTHI FESTIVAL
          </p>
        </div>
      </div>

      {/* Center hero showcase / clean cinematic atmosphere (dweepam removed) */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="flex flex-col items-center px-4 text-center">
          <p className="text-xs uppercase font-semibold tracking-[0.45em] text-lamp-200/80 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
            Gather Offerings · Dodge Moonlight · Complete Puja
          </p>
        </div>
      </div>

      {/* Bottom Center: Sign-in & Guest Action Buttons (Free Fire layout) */}
      <div className="safe-bottom absolute inset-x-0 bottom-6 z-30 flex flex-col items-center px-4">
        {showConsentWarning && (
          <div className="mb-3 animate-bounce rounded-lg border border-red-500/40 bg-red-950/80 px-4 py-1.5 text-xs text-red-200 backdrop-blur-sm">
            Please accept the Terms of Service & Age declaration below to continue.
          </div>
        )}

        <div className="flex w-full max-w-sm flex-col gap-2.5">
          {/* Sign in with Google */}
          <SignInButton mode="modal" forceRedirectUrl="/" signUpForceRedirectUrl="/">
            <button
              type="button"
              onClick={handleGoogleClick}
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-5 py-3 font-semibold text-gray-900 shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition hover:bg-gray-100 active:scale-[0.98]"
            >
              <GoogleSvg />
              <span className="text-sm tracking-wide">Sign in with Google</span>
            </button>
          </SignInButton>

          {/* Guest Button */}
          <button
            type="button"
            onClick={handleGuestClick}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/20 bg-black/60 px-5 py-3 text-sm font-semibold tracking-wide text-white backdrop-blur-md transition hover:border-lamp-400 hover:bg-black/75 hover:text-lamp-200 active:scale-[0.98]"
          >
            <UserSvg />
            <span>Play as Guest</span>
          </button>
        </div>

        {/* Checkboxes with interactive clickable links for Terms & Privacy */}
        <div className="mt-4 flex flex-col items-center space-y-1.5 text-[11px] text-white/80">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => {
                setAgreedTerms(e.target.checked);
                if (e.target.checked && agreedAge) setShowConsentWarning(false);
              }}
              className="h-3.5 w-3.5 rounded border-white/40 bg-black/60 text-lamp-400 focus:ring-0"
            />
            <span>
              I have read and agree to the{' '}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTermsModalOpen(true);
                }}
                className="underline decoration-lamp-400/60 font-semibold text-lamp-300 hover:text-lamp-100 transition"
              >
                Terms of Service
              </button>{' '}
              and{' '}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPrivacyModalOpen(true);
                }}
                className="underline decoration-lamp-400/60 font-semibold text-lamp-300 hover:text-lamp-100 transition"
              >
                Privacy Policies
              </button>
              .
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={agreedAge}
              onChange={(e) => {
                setAgreedAge(e.target.checked);
                if (e.target.checked && agreedTerms) setShowConsentWarning(false);
              }}
              className="h-3.5 w-3.5 rounded border-white/40 bg-black/60 text-lamp-400 focus:ring-0"
            />
            <span>I am over the age of majority or have received my guardian's approval.</span>
          </label>
        </div>
      </div>

      {/* Character Select Modal if triggered */}
      {showSelectModal && (
        <CharacterSelectModal
          initialName={existingProfile?.displayName || googleName}
          initialGender={existingProfile?.gender || 'male'}
          initialCharacter={existingProfile?.character || 'devotee'}
          initialCampus={existingProfile?.campus || ''}
          isGuest={guestModalOpen}
          onConfirm={handleModalConfirm}
          onCancel={() => setGuestModalOpen(false)}
        />
      )}

      {/* Interactive Terms & Privacy Modals */}
      <TermsOfServiceModal isOpen={termsModalOpen} onClose={() => setTermsModalOpen(false)} />
      <PrivacyPolicyModal isOpen={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />
    </div>
  );
}

function GoogleSvg() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function UserSvg() {
  return (
    <svg className="h-4 w-4 text-lamp-300" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
        clipRule="evenodd"
      />
    </svg>
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

function FloatingMotes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {MOTE_STYLE.map((m, i) => (
        <span
          key={i}
          className="menu-mote absolute bottom-0 rounded-full bg-lamp-300/70"
          style={{ left: m.left, width: m.size, height: m.size, animationDelay: m.delay, animationDuration: m.duration }}
        />
      ))}
    </div>
  );
}

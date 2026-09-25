import React from 'react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function BaseModal({ isOpen, onClose, title, children }: LegalModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Dialog */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-lamp-400/30 bg-night-950/95 p-6 shadow-[0_16px_50px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="font-display text-xl font-bold tracking-wide text-white sm:text-2xl">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-lamp-300/70">Moonlight Seva · Ganesh Chaturthi Edition</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:border-lamp-400/40 hover:bg-white/10 hover:text-white"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="custom-scrollbar my-4 overflow-y-auto pr-2 text-sm leading-relaxed text-night-200/90 space-y-4">
          {children}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-lamp-500 px-5 py-2.5 text-sm font-semibold tracking-wide text-night-950 shadow-md transition hover:bg-lamp-400 active:scale-95"
          >
            I Understand & Agree
          </button>
        </div>
      </div>
    </div>
  );
}

export function TermsOfServiceModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Terms of Service">
      <div className="space-y-4 text-xs sm:text-sm">
        <p className="text-lamp-200 font-medium">Effective Date: Ganesh Chaturthi 2026</p>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">1. Acceptance of Terms</h4>
          <p>
            By launching Moonlight Seva, logging in via Google, or connecting to multiplayer sessions, you agree to comply with and be bound by these Terms of Service.
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">2. Eligibility & Age Declaration</h4>
          <p>
            Moonlight Seva is designed for all audiences. If you are under the legal age of majority in your jurisdiction, you confirm that you have obtained consent from a parent or legal guardian to play this game and accept these terms.
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">3. Gameplay & Community Etiquette</h4>
          <p>
            Moonlight Seva is a cooperative cultural festival experience where players gather offerings (coconuts, modaks, flowers, diyas), evade moonlight shadows, and perform puja rituals before Lord Ganesha. Players agree to:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-night-300">
            <li>Engage respectfully with teammates and AI village residents.</li>
            <li>Not use offensive display names, hate speech, or harassment.</li>
            <li>Refrain from exploiting multiplayer synchronization bugs or game engine vulnerabilities.</li>
          </ul>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">4. Virtual Offerings & In-Game Items</h4>
          <p>
            All gathered offerings, temple lamps, prasad, and festival rank points are purely virtual elements intended for gameplay. They carry zero real-world cash or monetary exchange value.
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">5. Team Sessions & Privacy</h4>
          <p>
            Team codes (e.g. MOON-XXXX) allow peer-to-peer or host-mediated team play. You are responsible for sharing your team code with trusted friends.
          </p>
        </section>
      </div>
    </BaseModal>
  );
}

export function PrivacyPolicyModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Privacy Policy">
      <div className="space-y-4 text-xs sm:text-sm">
        <p className="text-lamp-200 font-medium">Effective Date: Ganesh Chaturthi 2026</p>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">1. Information We Collect</h4>
          <p>
            We respect your privacy. When using Moonlight Seva:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-night-300">
            <li><strong className="text-white">Google Sign-In (Clerk):</strong> We receive your verified email, display name, and avatar picture to populate your in-game profile.</li>
            <li><strong className="text-white">Profile:</strong> Your chosen display name, optional campus, avatar and game settings are stored in our database (Supabase), keyed to your account.</li>
            <li><strong className="text-white">Progress:</strong> Seva completion stats, offering tallies, ritual timings, teams and scores are stored in our database so they follow you across devices and appear on the leaderboards (display name, campus and scores only).</li>
          </ul>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">2. How Information is Used</h4>
          <p>
            Your information is exclusively used to:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-night-300">
            <li>Display your name tag and avatar above your 3D devotee character.</li>
            <li>Coordinate peer team connections during festival seva.</li>
            <li>Save your graphic preferences and audio volume levels.</li>
          </ul>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">3. Third-Party Services</h4>
          <p>
            We use Clerk for secure authentication. We do not sell, rent, or trade your personal information to any third parties or marketing networks.
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-semibold text-white">4. Your Data Rights & Deletion</h4>
          <p>
            You can log out of Clerk at any time, which ends your session on this device. To have your profile, teams and scores deleted from our database, contact the organisers with the email you signed in with.
          </p>
        </section>
      </div>
    </BaseModal>
  );
}

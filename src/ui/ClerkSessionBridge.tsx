/**
 * Clears the local game profile when Clerk signs out, and sends the player back to the name gate.
 */
import { useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { services } from './services';

export function ClerkSessionBridge({ onSignedOut }: { onSignedOut?: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      wasSignedIn.current = true;
      return;
    }
    if (wasSignedIn.current) {
      wasSignedIn.current = false;
      services().profiles.signOut();
      onSignedOut?.();
    }
  }, [isLoaded, isSignedIn, onSignedOut]);

  return null;
}

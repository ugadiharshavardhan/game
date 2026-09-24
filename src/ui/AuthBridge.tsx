/**
 * Hands the Clerk session to Supabase and the JWT auth engine, and tells the services who is signed in.
 *
 * Every request carries the verified session token. Services wait for this before they
 * make any request, so nothing is ever sent before auth is ready.
 */
import { useAuth, useUser } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { setAccessTokenProvider } from '../lib/supabase/client';
import { setJwtAuth } from '../net/jwtAuth';
import { services } from './services';

export function AuthBridge() {
  const { isLoaded: isAuthLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isAuthLoaded || !isUserLoaded) return;
    const { profiles, teams } = services();
    const id = isSignedIn && userId ? userId : null;
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const displayName = user?.fullName?.trim() || user?.firstName?.trim() || null;

    setJwtAuth(id ? () => getTokenRef.current() : null, id, email, displayName);
    setAccessTokenProvider(id ? () => getTokenRef.current() : null);

    if (typeof window !== 'undefined') {
      (window as unknown as { __clerkUserId?: string | null }).__clerkUserId = id;
    }

    if (id) {
      void profiles.load(id).then(() => {
        const name = profiles.profile.get()?.displayName || displayName || 'Devotee';
        teams.setUser(id, name);
      });
    } else {
      void profiles.load(null);
      teams.setUser(null, '');
    }
  }, [isAuthLoaded, isUserLoaded, isSignedIn, userId, user]);

  return null;
}

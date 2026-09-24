/**
 * Hands the Clerk session to Supabase, and tells the services who is signed in.
 *
 * Supabase trusts Clerk as a third-party auth provider: every request carries the Clerk session
 * token, and Postgres reads the player id from its `sub`. Services wait for this before they
 * make any request, so nothing is ever sent before auth is ready.
 */
import { useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { setAccessTokenProvider } from '../lib/supabase/client';
import { services } from './services';

export function AuthBridge() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    const { profiles, teams } = services();
    const id = isSignedIn && userId ? userId : null;
    setAccessTokenProvider(id ? () => getTokenRef.current() : null);
    void profiles.load(id);
    teams.setUser(id, profiles.profile.get()?.displayName ?? '');
  }, [isLoaded, isSignedIn, userId]);

  return null;
}

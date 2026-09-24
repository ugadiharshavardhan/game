/**
 * Canonical player identity helper: always extracts and enforces the Clerk User ID
 * as the permanent, authoritative player identity throughout Moonlight Seva.
 */
import { useAuth, useUser } from '@clerk/react';
import { useMemo } from 'react';

export interface CurrentPlayer {
  clerkUserId: string | null;
  profileId: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

export function useCurrentPlayer(): CurrentPlayer {
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();

  return useMemo(() => {
    const isLoaded = Boolean(isAuthLoaded && isUserLoaded);
    const signedIn = Boolean(isSignedIn && userId);
    const clerkUserId = signedIn && userId ? userId : null;
    const username = user?.username ?? null;
    const displayName = user?.fullName?.trim() || user?.firstName?.trim() || username || 'Devotee';
    const avatarUrl = user?.imageUrl ?? null;

    return {
      clerkUserId,
      profileId: null, // Relational profile ID from Supabase if needed
      username,
      displayName,
      avatarUrl,
      isLoaded,
      isSignedIn: signedIn,
    };
  }, [isAuthLoaded, isUserLoaded, isSignedIn, userId, user]);
}

'use client';

import { type PropsWithChildren, createContext, useContext, useMemo } from 'react';

import type { ClientAuthSession } from './session';

export type AuthSessionState =
  | { status: 'authenticated'; data: ClientAuthSession }
  | { status: 'unauthenticated'; data: null };

const AuthSessionContext = createContext<AuthSessionState>({
  status: 'unauthenticated',
  data: null,
});

/**
 * Provides the session resolved on the server, so the first render already
 * knows whether the user is signed in. better-auth's `useSession()` would
 * fetch `/api/auth/get-session` after mount instead, which flashes the
 * signed-out UI and costs a request per page load.
 */
export function AuthSessionProvider({
  session,
  children,
}: PropsWithChildren<{ session: ClientAuthSession | null }>) {
  const value = useMemo<AuthSessionState>(
    () =>
      session ? { status: 'authenticated', data: session } : { status: 'unauthenticated', data: null },
    [session]
  );
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionState {
  return useContext(AuthSessionContext);
}

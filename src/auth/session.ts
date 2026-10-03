/**
 * The session as passed from the server to the browser. Tokens are left out:
 * the browser never talks to the backend with the OAuth token directly, the
 * GraphQL proxy injects it.
 */
export type ClientAuthSession = {
  user: {
    id: string;
    name: string;
    email?: string | null;
    image?: string | null;
  };
  /** ISO timestamp */
  expires: string;
  /** Whether the session currently holds a usable access token. */
  hasAccessToken: boolean;
};

type ServerSessionLike = {
  user: { id: string; name: string; email?: string | null; image?: string | null };
  session: { expiresAt: Date | string };
  hasAccessToken?: boolean;
  accessToken?: string | null;
};

export function toClientAuthSession(session: ServerSessionLike | null): ClientAuthSession | null {
  if (!session) return null;
  const { user } = session;
  return {
    user: { id: user.id, name: user.name, email: user.email ?? null, image: user.image ?? null },
    expires: new Date(session.session.expiresAt).toISOString(),
    hasAccessToken: session.hasAccessToken ?? session.accessToken != null,
  };
}

export function hasSessionExpired(session: Pick<ClientAuthSession, 'expires'>): boolean {
  return new Date(session.expires) <= new Date();
}

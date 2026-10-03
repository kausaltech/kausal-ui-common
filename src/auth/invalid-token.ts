/**
 * Recover in the browser from an OAuth session the backend has rejected: the
 * cookies are dead, so sign out and reload. After the reload a public page
 * renders anonymously.
 *
 * Sign-out must go through the better-auth client: it clears all of
 * `session_token`, `session_data` and `account_data`, which a raw fetch did
 * not reliably do (the page kept looping).
 *
 * `loadSignOut` is called lazily, so the module stays safe to import from
 * bundles shared between the server and the browser.
 */
export function createInvalidTokenRecovery(loadSignOut: () => Promise<() => Promise<unknown>>) {
  let inFlight = false;

  return function recoverFromInvalidToken(): void {
    if (typeof window === 'undefined') return;
    // Parallel operations can all fail with the same error; recover once.
    if (inFlight) return;
    inFlight = true;
    void (async () => {
      try {
        const signOut = await loadSignOut();
        await signOut();
      } catch {
        // Best-effort: reload anyway.
      } finally {
        window.location.reload();
      }
    })();
  };
}

/**
 * The backend reports a rejected OAuth token as an `UNAUTHENTICATED` GraphQL
 * error whose message starts with `invalid_token`.
 */
export function isInvalidTokenMessage(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.startsWith('invalid_token');
}

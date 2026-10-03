import { type NextRequest, NextResponse } from 'next/server';

import { safeReturnPath } from './return-path';
import { type KausalAuthSource, resolveKausalAuth } from './server';

/** GET/POST handlers for `src/app/api/auth/[...all]/route.ts`. */
export function createAuthRouteHandlers(source: KausalAuthSource) {
  const handler = (req: Request) => resolveKausalAuth(source, req.headers).handler(req);
  return { GET: handler, POST: handler };
}

/**
 * GET handler that clears a rejected OAuth session and redirects back to
 * `?returnTo=`. RSC renders can't write cookies, so when the backend rejects
 * the token during one, the RSC redirects here.
 */
export function createRecoverInvalidTokenHandler(source: KausalAuthSource) {
  return async function GET(req: NextRequest) {
    await resolveKausalAuth(source, req.headers).api.signOut({ headers: req.headers });
    const returnTo = safeReturnPath(req.nextUrl.searchParams.get('returnTo'));
    return NextResponse.redirect(new URL(returnTo, req.url), 303);
  };
}

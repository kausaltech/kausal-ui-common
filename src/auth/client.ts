import { customSessionClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import type { KausalAuth } from './server';

export function createKausalAuthClient() {
  return createAuthClient({
    plugins: [customSessionClient<KausalAuth>()],
  });
}

export type KausalAuthClient = ReturnType<typeof createKausalAuthClient>;

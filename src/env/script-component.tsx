import type { FC } from 'react';

import { unstable_noStore as noStore } from 'next/cache';
import Script from 'next/script';

import { WINDOW_PUBLIC_ENV_KEY, getPublicEnv } from './runtime';

type EnvScriptProps = {
  nonce?: string;
};

export function getEnvScriptContents(): string {
  const env = getPublicEnv();
  return `window['${WINDOW_PUBLIC_ENV_KEY}'] = ${JSON.stringify(env)}`;
}

const EnvScript: FC<EnvScriptProps> = ({ nonce }: EnvScriptProps) => {
  let nonceString: string | undefined;

  if (typeof nonce === 'string') {
    nonceString = nonce;
  }

  noStore();

  return (
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script
      id="public-runtime-env"
      strategy="beforeInteractive"
      nonce={nonceString}
      dangerouslySetInnerHTML={{
        __html: getEnvScriptContents(),
      }}
    />
  );
};

export default EnvScript;

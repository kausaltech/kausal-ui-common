import type { FC } from "react";

import Script from 'next/script';
import { unstable_noStore as noStore } from 'next/cache';
import { getPublicEnv, WINDOW_PUBLIC_ENV_KEY } from "./runtime";


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

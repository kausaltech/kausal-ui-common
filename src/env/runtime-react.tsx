'use client';

import React, { useRef } from 'react';

import { useServerInsertedHTML } from 'next/navigation';

import { WINDOW_PUBLIC_ENV_KEY, getPublicEnv } from './runtime';

export function getPublicEnvAsMetaComponents() {
  const nodes = Object.entries(getPublicEnv()).map(([name, value]) =>
    React.createElement('meta', { name: 'env', content: `${name}=${value}` })
  );
  return nodes;
}

export function getPublicEnvAsScriptTag() {
  const html = `window['${WINDOW_PUBLIC_ENV_KEY}'] = ${JSON.stringify(getPublicEnv())}`;
  return React.createElement('script', {
    id: 'public-runtime-env',
    dangerouslySetInnerHTML: { __html: html },
  });
}

export function EnvProvider() {
  const ref = useRef(false);
  useServerInsertedHTML(() => {
    if (ref.current) return;
    ref.current = true;
    return <>{getPublicEnvAsMetaComponents()}</>;
  });
  return <></>;
}

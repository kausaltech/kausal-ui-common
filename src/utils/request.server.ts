'use server';

import { headers } from 'next/headers';

export async function getRequestOrigin() {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = headersList.get('x-forwarded-proto');
  const origin = `${protocol}://${host}`;
  return origin;
}

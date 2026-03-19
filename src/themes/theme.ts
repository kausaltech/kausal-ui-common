import { getAssetPrefix } from '@common/env';

export function formatStaticUrl(url: string) {
  if (!url) return url;
  if (url.startsWith('/')) {
    const pathPrefix = getAssetPrefix() || '';
    return `${pathPrefix}${url}`;
  }
  return url;
}

export function getThemeStaticURL(path: string) {
  return formatStaticUrl(`/static/themes/${path}`);
}

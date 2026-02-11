import type { Theme } from '@kausal/themes/types';

import { getAssetPrefix } from '@common/env';
import { getLogger } from '@common/logging';

export async function loadTheme(themeIdentifier: string): Promise<Theme> {
  let themeProps: Theme;
  let readThemeFile: (id: string) => Promise<Theme>;
  const logger = getLogger('theme');

  if (!process.browser) {
    const fs = await import('node:fs');
    const THEME_PATH = './public/static/themes';
    readThemeFile = async (id: string) => {
      const theme = fs.readFileSync(`${THEME_PATH}/${id}/theme.json`, {
        encoding: 'utf8',
      });
      return JSON.parse(theme) as Theme;
    };
  } else {
    const THEME_PATH = '/public/static/themes';
    readThemeFile = async (id: string) => {
      const theme = await import(`${THEME_PATH}/${id}/theme.json`);
      return theme.default;
    };
  }
  try {
    themeProps = await readThemeFile(themeIdentifier);
    return themeProps;
  } catch (error) {
    logger.error(error, `Theme with identifier ${themeIdentifier} not found`);
    themeProps = await readThemeFile('default');
    return themeProps;
  }
}

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

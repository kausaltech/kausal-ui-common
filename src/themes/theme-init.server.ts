import type { Theme } from '@kausal/themes/types';
import { getLogger } from '@common/logging';


export async function loadTheme(themeIdentifier: string): Promise<Theme> {
  let themeProps: Theme;
  const logger = getLogger('theme');
  const fs = await import('node:fs');

  const THEME_PATH = './public/static/themes';

  async function readThemeFile(id: string) {
    const theme = await fs.promises.readFile(`${THEME_PATH}/${id}/theme.json`, {
      encoding: 'utf8',
    });
    return JSON.parse(theme) as Theme;
  };

  try {
    themeProps = await readThemeFile(themeIdentifier);
    return themeProps;
  } catch (error) {
    logger.error(error, `Theme with identifier ${themeIdentifier} not found`);
    themeProps = await readThemeFile('default');
    return themeProps;
  }
}

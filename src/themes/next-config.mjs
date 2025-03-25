// @ts-check
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import * as lockfile from 'proper-lockfile';

/**
 * @param {string[]} packageNames
 */
function tryImportThemePackage(packageNames) {
  const require = createRequire(import.meta.url);
  for (const packageName of packageNames) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return require(packageName);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
    }
  }
  return null;
}
/**
 * @param {string} rootDir
 */
export function initializeThemes(rootDir) {
  const staticPath = join(rootDir, 'public', 'static');
  mkdirSync(staticPath, { recursive: true });
  const releaseThemeLock = lockfile.lockSync('public/static');
  const require = createRequire(rootDir);
  try {
    const destPath = join(rootDir, 'public', 'static', 'themes');
    const themesPrivate = tryImportThemePackage([
      '@kausal-private/themes-private/setup.cjs',
      '@kausal/themes-private/setup.cjs',
    ]);
    if (themesPrivate) {
      const { generateThemeSymlinks: generateThemeSymlinksPrivate } = themesPrivate;
      generateThemeSymlinksPrivate(destPath, { verbose: false });
    } else {
      console.log('Private themes not found; using public themes');
      const {
        generateThemeSymlinks: generateThemeSymlinksPublic,
      } = require('@kausal/themes/setup.cjs');
      generateThemeSymlinksPublic(destPath, { verbose: false });
    }
  } finally {
    releaseThemeLock();
  }
}

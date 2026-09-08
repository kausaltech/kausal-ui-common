// @ts-check
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import * as lockfile from 'proper-lockfile';

/**
 * @param {NodeRequire} require
 * @param {string[]} packageNames
 */
function tryImportThemePackage(require, packageNames) {
  for (const packageName of packageNames) {
    try {
      return require(packageName);
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code !== 'MODULE_NOT_FOUND') {
        throw err;
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
  const require = createRequire(join(rootDir, 'package.json'));
  try {
    const destPath = join(rootDir, 'public', 'static', 'themes');
    const themesPrivate = tryImportThemePackage(createRequire(import.meta.url), [
      '@kausal-private/themes-private/setup.cjs',
      '@kausal/themes-private/setup.cjs',
    ]);
    if (themesPrivate) {
      const { generateThemeSymlinks: generateThemeSymlinksPrivate } = themesPrivate;
      generateThemeSymlinksPrivate(destPath, { verbose: false });
    } else {
      console.log('Private themes not found; using public themes');
      const themesPublic = tryImportThemePackage(require, ['@kausal/themes/setup.cjs']);
      if (!themesPublic) {
        throw new Error('Neither private nor public theme packages could be loaded');
      }
      const { generateThemeSymlinks: generateThemeSymlinksPublic } = themesPublic;
      generateThemeSymlinksPublic(destPath, { verbose: false });
    }
  } finally {
    releaseThemeLock();
  }
}

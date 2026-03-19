//@ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * @import { JSONSchemaForNPMPackageJsonFiles } from '@schemastore/package';
 * */

const KNOWN_PROJECTS = ['watch-ui', 'paths-ui', '@kausal/nzc-data-studio'];

/**
 * @param {string} basePath
 * @returns {import('@schemastore/package').JSONSchemaForNPMPackageJsonFiles}
 */
export function getPackageData(basePath) {
  const contents = fs.readFileSync(path.join(basePath, 'package.json'), 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const packageJson = /** @type {JSONSchemaForNPMPackageJsonFiles} */ (JSON.parse(contents));
  return packageJson;
}

/**
 * @param {string} basePath
 * @returns {import('./static').ProjectId}
 */
export function getProjectIdFromPackageJson(basePath) {
  if (typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('getProjectIdFromPackageJson can only be called from the server');
  }
  const packageData = getPackageData(basePath);
  const packageName = packageData.name;
  const foundId = KNOWN_PROJECTS.find((id) => packageName?.includes(id)) ?? null;
  if (foundId === null) {
    throw new Error(`Unknown project: ${packageName}`);
  }
  switch (foundId) {
    case '@kausal/nzc-data-studio':
      return 'data-studio';
    case 'watch-ui':
      return 'watch-ui';
    case 'paths-ui':
      return 'paths-ui';
    default:
      throw new Error(`Unknown project: ${foundId}`);
  }
}

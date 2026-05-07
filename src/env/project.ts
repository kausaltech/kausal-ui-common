import fs from 'node:fs';
import path from 'node:path';

import type { JSONSchemaForNPMPackageJsonFiles } from '@schemastore/package';

import type { ProjectId } from './static.js';

const KNOWN_PROJECTS = ['watch-ui', 'paths-ui', '@kausal/nzc-data-studio'];

export function getPackageData(basePath: string): JSONSchemaForNPMPackageJsonFiles {
  const contents = fs.readFileSync(path.join(basePath, 'package.json'), 'utf8');
  const packageJson = JSON.parse(contents) as JSONSchemaForNPMPackageJsonFiles;
  return packageJson;
}

export function getProjectIdFromPackageJson(basePath: string): ProjectId {
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

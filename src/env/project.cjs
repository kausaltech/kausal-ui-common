//@ts-check
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

const KNOWN_PROJECTS = ['watch-ui', 'paths-ui', '@kausal/nzc-data-studio'];

/**
 * @param {string} basePath
 */
function getPackageData(basePath) {
  const path = require('path');
  const fs = require('fs');
  return JSON.parse(fs.readFileSync(path.join(basePath, 'package.json'), 'utf8'));
}

/**
 * @param {string} basePath
 * @returns {import('./static').ProjectId}
 */
function getProjectIdFromPackageJson(basePath) {
  if (typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('getProjectIdFromPackageJson can only be called from the server');
  }
  const packageData = getPackageData(basePath);
  const packageName = packageData.name;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const foundId = KNOWN_PROJECTS.find((id) => packageName.includes(id)) ?? null;
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

module.exports = {
  getProjectIdFromPackageJson,
  getPackageData,
};

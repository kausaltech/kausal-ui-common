//@ts-check
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const KNOWN_PROJECTS = ['watch-ui', 'paths-ui'];

/**
 * @param {string} basePath
 * @returns {string}
 */
function getProjectIdFromPackageJson(basePath) {
  if (typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('getProjectIdFromPackageJson can only be called from the server');
  }
  const path = require('path');
  const fs = require('fs');
  const packageData = JSON.parse(fs.readFileSync(path.join(basePath, 'package.json'), 'utf8'));
  const packageName = packageData.name;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const foundId = KNOWN_PROJECTS.find((id) => packageName.includes(id)) ?? null;
  if (foundId === null) {
    throw new Error(`Unknown project: ${packageName}`);
  }
  return foundId;
}

module.exports = {
  getProjectIdFromPackageJson,
};

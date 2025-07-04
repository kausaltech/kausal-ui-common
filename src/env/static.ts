export const isServer = typeof window === 'undefined';
export const isLocalDev = process.env.NODE_ENV === 'development';
export const isEdgeRuntime = isServer && process.env.NEXT_RUNTIME === 'edge';
export const isNodeRuntime = isServer && process.env.NEXT_RUNTIME === 'nodejs';

export type ProjectId = 'watch-ui' | 'paths-ui' | 'data-studio';
export type ProductId = 'watch' | 'paths' | 'data-studio';

const KNOWN_PROJECTS = ['watch-ui', 'paths-ui', 'data-studio'];

let projectId: ProjectId;

export function getProjectId() {
  if (projectId) return projectId;
  const envProjectId = process.env.PROJECT_ID || '';
  if (!KNOWN_PROJECTS.includes(envProjectId)) {
    throw new Error(`Unknown project: ${envProjectId}`);
  }
  projectId = envProjectId as ProjectId;
  return projectId;
}

export function getProductId() {
  const projectId = getProjectId();
  return projectId === 'watch-ui' ? 'watch' : 'paths';
}

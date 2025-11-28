/**
 * Clustering algorithms for grouping related files
 */

import { dirname, relative, sep } from 'path';
import { Graph, Cluster } from '../types/index.js';
import { getAllNodes, getInDegree, getOutDegree } from './types.js';

/**
 * Cluster files by directory structure
 * Groups files that are in the same directory or subdirectory
 */
export function clusterByDirectory(graph: Graph, repoRoot: string, maxDepth: number = 2): Cluster[] {
  const nodes = getAllNodes(graph);
  const clusterMap = new Map<string, string[]>(); // clusterId → files

  for (const node of nodes) {
    const relativePath = relative(repoRoot, node.filePath);
    const parts = relativePath.split(sep);

    // Use first N directory parts as cluster ID
    const clusterParts = parts.slice(0, Math.min(maxDepth, parts.length - 1));
    const clusterId = clusterParts.length > 0 ? clusterParts.join('/') : 'root';

    if (!clusterMap.has(clusterId)) {
      clusterMap.set(clusterId, []);
    }
    clusterMap.get(clusterId)!.push(node.filePath);
  }

  // Convert to Cluster objects
  const clusters: Cluster[] = [];

  for (const [clusterId, files] of clusterMap.entries()) {
    // Only include clusters with multiple files or significant single files
    if (files.length === 0) continue;

    // Generate a human-readable name from the cluster ID
    const name = generateClusterName(clusterId);

    // Calculate cohesion (how interconnected are files within the cluster)
    const cohesion = calculateCohesion(graph, files);

    clusters.push({
      clusterId,
      name,
      files,
      cohesion,
      description: `${files.length} files in ${clusterId || 'root directory'}`,
    });
  }

  // Sort by number of files (largest first)
  clusters.sort((a, b) => b.files.length - a.files.length);

  return clusters;
}

/**
 * Generate a human-readable name from a cluster ID (directory path)
 */
function generateClusterName(clusterId: string): string {
  if (!clusterId || clusterId === 'root') {
    return 'Root';
  }

  // Convert path to title case
  const parts = clusterId.split('/');
  const lastPart = parts[parts.length - 1];

  // Handle common patterns
  const nameMap: Record<string, string> = {
    src: 'Source',
    lib: 'Library',
    api: 'API',
    components: 'Components',
    utils: 'Utilities',
    helpers: 'Helpers',
    services: 'Services',
    models: 'Models',
    types: 'Types',
    interfaces: 'Interfaces',
    controllers: 'Controllers',
    routes: 'Routes',
    middleware: 'Middleware',
    config: 'Configuration',
    tests: 'Tests',
    test: 'Tests',
    __tests__: 'Tests',
    auth: 'Authentication',
    db: 'Database',
    data: 'Data Layer',
  };

  if (nameMap[lastPart]) {
    return nameMap[lastPart];
  }

  // Capitalize first letter
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
}

/**
 * Calculate cohesion of a cluster
 * Cohesion = (internal edges) / (total possible edges within cluster)
 */
function calculateCohesion(graph: Graph, files: string[]): number {
  if (files.length <= 1) return 1.0;

  let internalEdges = 0;
  const fileSet = new Set(files);

  // Count edges within the cluster
  for (const edge of graph.edges) {
    if (fileSet.has(edge.source) && fileSet.has(edge.target)) {
      internalEdges++;
    }
  }

  // Maximum possible edges (fully connected graph)
  const maxPossibleEdges = files.length * (files.length - 1);

  if (maxPossibleEdges === 0) return 0;

  return internalEdges / maxPossibleEdges;
}

/**
 * Merge small clusters into an "Other" cluster
 */
export function mergeSmallClusters(clusters: Cluster[], minSize: number = 3): Cluster[] {
  const largeClusters: Cluster[] = [];
  const smallFiles: string[] = [];

  for (const cluster of clusters) {
    if (cluster.files.length >= minSize) {
      largeClusters.push(cluster);
    } else {
      smallFiles.push(...cluster.files);
    }
  }

  // Add "Other" cluster if there are small files
  if (smallFiles.length > 0) {
    largeClusters.push({
      clusterId: 'other',
      name: 'Other',
      files: smallFiles,
      description: `${smallFiles.length} miscellaneous files`,
      cohesion: 0,
    });
  }

  return largeClusters;
}

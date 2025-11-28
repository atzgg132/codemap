/**
 * detectClusters Tool
 * Groups related files into logical modules/clusters
 */

import { DetectClustersInput, DetectClustersOutput } from '../types/index.js';
import { clusterByDirectory, mergeSmallClusters } from '../graph/clustering.js';

/**
 * Detect and group files into logical clusters
 */
export async function detectClusters(
  input: DetectClustersInput
): Promise<DetectClustersOutput> {
  const { graph, repoRoot } = input;

  if (!repoRoot) {
    throw new Error('repoRoot is required for clustering');
  }

  console.log(`Detecting clusters in ${graph.nodes.size} files...`);

  // Use directory-based clustering
  let clusters = clusterByDirectory(graph, repoRoot, 2);

  // Merge very small clusters
  clusters = mergeSmallClusters(clusters, 3);

  console.log(`Found ${clusters.length} clusters:`);
  clusters.slice(0, 10).forEach(cluster => {
    console.log(
      `  - ${cluster.name}: ${cluster.files.length} files (cohesion: ${((cluster.cohesion || 0) * 100).toFixed(1)}%)`
    );
  });

  return { clusters };
}

/**
 * Tool metadata for NeuroLink agent
 */
export const detectClustersTool = {
  name: 'detectClusters',
  description: `Groups related files into logical modules or clusters.

    Use this tool to:
    - Understand the modular structure of the codebase
    - Identify logical groupings of related files
    - See how the codebase is organized

    Clustering strategy:
    - Groups files by directory structure
    - Calculates cohesion (how interconnected files within a cluster are)
    - Merges very small clusters into "Other"

    Input: { graph: Graph, repoRoot: string }
    Output: { clusters: Cluster[] } - sorted by size (largest first)

    Each cluster includes:
    - name: Human-readable name
    - files: Array of file paths in this cluster
    - cohesion: 0-1 score (higher = more interconnected)`,
  fn: detectClusters,
};

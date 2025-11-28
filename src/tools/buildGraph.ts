/**
 * buildGraph Tool
 * Constructs a dependency graph from parsed file data
 */

import { BuildGraphInput, BuildGraphOutput } from '../types/index.js';
import { buildGraph as buildGraphFromFiles } from '../graph/builder.js';

/**
 * Build a dependency graph from parsed files
 */
export async function buildGraph(input: BuildGraphInput): Promise<BuildGraphOutput> {
  const { parsedFiles, repoRoot } = input;

  console.log(`Building dependency graph from ${parsedFiles.length} files...`);

  const graph = buildGraphFromFiles(parsedFiles, repoRoot);

  console.log(
    `Graph built: ${graph.nodes.size} nodes, ${graph.edges.length} edges`
  );

  return { graph };
}

/**
 * Tool metadata for NeuroLink agent
 */
export const buildGraphTool = {
  name: 'buildGraph',
  description: `Constructs a dependency graph from parsed file data.

    Use this tool after parsing files to:
    - Build a complete dependency graph of the codebase
    - Understand import relationships between files
    - Enable further analysis (PageRank, clustering, etc.)

    Input: { parsedFiles: ParsedFile[], repoRoot?: string }
    Output: { graph: Graph }

    The graph contains nodes (files) and edges (import relationships).`,
  fn: buildGraph,
};

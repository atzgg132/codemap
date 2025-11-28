/**
 * rankImportance Tool
 * Runs PageRank algorithm to identify most important files
 */

import { RankImportanceInput, RankImportanceOutput } from '../types/index.js';
import { pageRank } from '../graph/pagerank.js';

/**
 * Rank files by importance using PageRank algorithm
 */
export async function rankImportance(
  input: RankImportanceInput
): Promise<RankImportanceOutput> {
  const { graph, iterations = 20, dampingFactor = 0.85 } = input;

  console.log(
    `Running PageRank on ${graph.nodes.size} nodes (${iterations} iterations)...`
  );

  const rankedFiles = pageRank(graph, iterations, dampingFactor);

  console.log(`Top 5 files by importance:`);
  rankedFiles.slice(0, 5).forEach(rf => {
    console.log(
      `  ${rf.rank}. ${rf.file} (score: ${rf.score.toFixed(4)}, imports: ${rf.outDegree}, imported by: ${rf.inDegree})`
    );
  });

  return { rankedFiles };
}

/**
 * Tool metadata for NeuroLink agent
 */
export const rankImportanceTool = {
  name: 'rankImportance',
  description: `Runs PageRank algorithm to identify the most important files in the codebase.

    Use this tool to:
    - Find core files that many other files depend on
    - Identify central utilities and shared code
    - Understand which files are most critical to understand

    PageRank intuition:
    - Files imported by many files are important
    - Files imported by other important files are even more important
    - Importance flows through the dependency graph

    Input: { graph: Graph, iterations?: number, dampingFactor?: number }
    Output: { rankedFiles: RankedFile[] } - sorted by importance (rank 1 = most important)`,
  fn: rankImportance,
};

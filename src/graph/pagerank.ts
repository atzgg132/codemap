/**
 * PageRank algorithm for identifying important files
 */

import { Graph, RankedFile } from '../types/index.js';
import { getInDegree, getOutDegree } from './types.js';

/**
 * Run PageRank algorithm on a dependency graph
 *
 * PageRank intuition:
 * - A file is important if it's imported by many files
 * - A file is more important if it's imported by other important files
 * - Importance flows through the import graph
 *
 * @param graph The dependency graph
 * @param iterations Number of iterations (more = more accurate, but slower)
 * @param dampingFactor Probability of following links (typically 0.85)
 * @returns Array of files with PageRank scores, sorted by importance
 */
export function pageRank(
  graph: Graph,
  iterations: number = 20,
  dampingFactor: number = 0.85
): RankedFile[] {
  const nodes = Array.from(graph.nodes.keys());
  const n = nodes.length;

  if (n === 0) {
    return [];
  }

  // Initialize: all nodes start with equal rank
  const scores = new Map<string, number>();
  const initialScore = 1.0 / n;

  for (const node of nodes) {
    scores.set(node, initialScore);
  }

  // Iterate to convergence
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of nodes) {
      // Base score (random jump probability)
      let score = (1 - dampingFactor) / n;

      // Add contributions from nodes that import this one
      const importers = graph.reverseAdjacencyList.get(node) || [];
      for (const importer of importers) {
        const importerScore = scores.get(importer) || 0;
        const importerOutDegree = getOutDegree(graph, importer);

        // Distribute importer's score among all its imports
        if (importerOutDegree > 0) {
          score += dampingFactor * (importerScore / importerOutDegree);
        }
      }

      newScores.set(node, score);
    }

    // Update scores
    for (const [node, score] of newScores) {
      scores.set(node, score);
    }
  }

  // Convert to RankedFile array and sort by score
  const rankedFiles: RankedFile[] = nodes.map(file => ({
    file,
    score: scores.get(file) || 0,
    rank: 0, // Will be set after sorting
    inDegree: getInDegree(graph, file),
    outDegree: getOutDegree(graph, file),
  }));

  // Sort by score descending
  rankedFiles.sort((a, b) => b.score - a.score);

  // Assign ranks
  rankedFiles.forEach((rf, index) => {
    rf.rank = index + 1;
  });

  return rankedFiles;
}

/**
 * Get top N most important files
 */
export function getTopFiles(rankedFiles: RankedFile[], n: number): RankedFile[] {
  return rankedFiles.slice(0, n);
}

/**
 * Normalize PageRank scores to 0-1 range for easier interpretation
 */
export function normalizeScores(rankedFiles: RankedFile[]): RankedFile[] {
  if (rankedFiles.length === 0) return [];

  const maxScore = Math.max(...rankedFiles.map(rf => rf.score));
  const minScore = Math.min(...rankedFiles.map(rf => rf.score));
  const range = maxScore - minScore;

  if (range === 0) return rankedFiles;

  return rankedFiles.map(rf => ({
    ...rf,
    score: (rf.score - minScore) / range,
  }));
}

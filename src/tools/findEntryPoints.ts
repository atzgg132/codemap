/**
 * findEntryPoints Tool
 * Identifies entry points - files that are imported by many but import few
 */

import { FindEntryPointsInput, FindEntryPointsOutput, EntryPoint, FileType } from '../types/index.js';
import { getInDegree, getOutDegree, getAllNodes } from '../graph/types.js';

/**
 * Classify a file based on its import patterns
 */
function classifyFile(inDegree: number, outDegree: number, avgInDegree: number, avgOutDegree: number): {
  type: FileType;
  reason: string;
} {
  const threshold = 1.2; // Files with degree > avg * threshold are considered high

  const highInDegree = inDegree > avgInDegree * threshold;
  const highOutDegree = outDegree > avgOutDegree * threshold;

  if (highInDegree && !highOutDegree) {
    return {
      type: 'entry',
      reason: `Imported by ${inDegree} files but only imports ${outDegree} - likely an entry point or core utility`,
    };
  }

  if (highInDegree && highOutDegree) {
    return {
      type: 'hub',
      reason: `Central connector: imported by ${inDegree} files and imports ${outDegree} files`,
    };
  }

  if (!highInDegree && highOutDegree) {
    return {
      type: 'aggregator',
      reason: `Aggregates many dependencies: imports ${outDegree} files but only imported by ${inDegree}`,
    };
  }

  if (inDegree > 0 || outDegree > 0) {
    return {
      type: 'util',
      reason: `Regular file with moderate connectivity`,
    };
  }

  return {
    type: 'leaf',
    reason: `Isolated file with no connections`,
  };
}

/**
 * Find entry points and classify all files by their role
 */
export async function findEntryPoints(
  input: FindEntryPointsInput
): Promise<FindEntryPointsOutput> {
  const { graph } = input;

  const nodes = getAllNodes(graph);

  if (nodes.length === 0) {
    return { entryPoints: [] };
  }

  // Calculate average degrees for classification
  let totalInDegree = 0;
  let totalOutDegree = 0;

  for (const node of nodes) {
    totalInDegree += getInDegree(graph, node.filePath);
    totalOutDegree += getOutDegree(graph, node.filePath);
  }

  const avgInDegree = totalInDegree / nodes.length;
  const avgOutDegree = totalOutDegree / nodes.length;

  console.log(
    `Classifying ${nodes.length} files (avg in-degree: ${avgInDegree.toFixed(2)}, avg out-degree: ${avgOutDegree.toFixed(2)})...`
  );

  // Classify all files
  const entryPoints: EntryPoint[] = [];

  for (const node of nodes) {
    const inDegree = getInDegree(graph, node.filePath);
    const outDegree = getOutDegree(graph, node.filePath);

    const { type, reason } = classifyFile(inDegree, outDegree, avgInDegree, avgOutDegree);

    entryPoints.push({
      file: node.filePath,
      inDegree,
      outDegree,
      type,
      reason,
    });
  }

  // Sort by in-degree (most depended on first)
  entryPoints.sort((a, b) => b.inDegree - a.inDegree);

  // Log summary
  const typeCounts = entryPoints.reduce((acc, ep) => {
    acc[ep.type] = (acc[ep.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('File classification summary:');
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  const topEntries = entryPoints.filter(ep => ep.type === 'entry').slice(0, 5);
  if (topEntries.length > 0) {
    console.log('\nTop entry points:');
    topEntries.forEach(ep => {
      console.log(`  - ${ep.file} (imported by ${ep.inDegree} files)`);
    });
  }

  return { entryPoints };
}

/**
 * Tool metadata for NeuroLink agent
 */
export const findEntryPointsTool = {
  name: 'findEntryPoints',
  description: `Identifies entry points and classifies all files by their role in the dependency graph.

    Use this tool to:
    - Find entry points (files imported by many but import few)
    - Identify hubs (central connectors)
    - Locate aggregators (files that pull in many dependencies)
    - Classify files by their role

    File types:
    - entry: Imported by many, imports few (core utilities, shared types)
    - hub: Central connector with many incoming and outgoing edges
    - aggregator: Pulls in many dependencies (typically app entry points)
    - util: Regular file with moderate connectivity
    - leaf: Isolated file

    Input: { graph: Graph }
    Output: { entryPoints: EntryPoint[] } - sorted by in-degree (most depended on first)`,
  fn: findEntryPoints,
};

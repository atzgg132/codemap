/**
 * Graph type definitions and utilities
 */

import { Graph, Node, Edge } from '../types/index.js';

/**
 * Create an empty graph
 */
export function createGraph(): Graph {
  return {
    nodes: new Map(),
    edges: [],
    adjacencyList: new Map(),
    reverseAdjacencyList: new Map(),
  };
}

/**
 * Get node by file path
 */
export function getNode(graph: Graph, filePath: string): Node | undefined {
  return graph.nodes.get(filePath);
}

/**
 * Get all files that import a given file (reverse dependencies)
 */
export function getImporters(graph: Graph, filePath: string): string[] {
  return graph.reverseAdjacencyList.get(filePath) || [];
}

/**
 * Get all files that a given file imports (forward dependencies)
 */
export function getImports(graph: Graph, filePath: string): string[] {
  return graph.adjacencyList.get(filePath) || [];
}

/**
 * Calculate in-degree (how many files import this file)
 */
export function getInDegree(graph: Graph, filePath: string): number {
  return getImporters(graph, filePath).length;
}

/**
 * Calculate out-degree (how many files this file imports)
 */
export function getOutDegree(graph: Graph, filePath: string): number {
  return getImports(graph, filePath).length;
}

/**
 * Get all nodes as an array
 */
export function getAllNodes(graph: Graph): Node[] {
  return Array.from(graph.nodes.values());
}

/**
 * Get graph statistics
 */
export function getGraphStats(graph: Graph): {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  maxInDegree: number;
  maxOutDegree: number;
} {
  const nodeCount = graph.nodes.size;
  const edgeCount = graph.edges.length;

  let maxInDegree = 0;
  let maxOutDegree = 0;
  let totalDegree = 0;

  for (const node of graph.nodes.keys()) {
    const inDegree = getInDegree(graph, node);
    const outDegree = getOutDegree(graph, node);

    maxInDegree = Math.max(maxInDegree, inDegree);
    maxOutDegree = Math.max(maxOutDegree, outDegree);
    totalDegree += inDegree + outDegree;
  }

  return {
    nodeCount,
    edgeCount,
    avgDegree: nodeCount > 0 ? totalDegree / nodeCount : 0,
    maxInDegree,
    maxOutDegree,
  };
}

/**
 * Graph builder - constructs dependency graph from parsed files
 */

import { dirname, join, resolve, extname, relative } from 'path';
import { existsSync } from 'fs';
import { Graph, Node, Edge, ParsedFile } from '../types/index.js';
import { createGraph } from './types.js';

/**
 * Build a dependency graph from parsed files
 */
export class GraphBuilder {
  private graph: Graph;
  private filePathMap: Map<string, string>; // Normalized path → actual file path
  private repoRoot: string;

  constructor(repoRoot?: string) {
    this.graph = createGraph();
    this.filePathMap = new Map();
    this.repoRoot = repoRoot || process.cwd();
  }

  /**
   * Add a node to the graph
   */
  addNode(parsedFile: ParsedFile): void {
    const node: Node = {
      id: parsedFile.filePath,
      filePath: parsedFile.filePath,
      language: parsedFile.language,
      metadata: {
        definitions: parsedFile.definitions.length,
      },
    };

    this.graph.nodes.set(parsedFile.filePath, node);

    // Build file path map for import resolution
    this.indexFile(parsedFile.filePath);
  }

  /**
   * Add an edge to the graph
   */
  addEdge(source: string, target: string, imports?: string[]): void {
    // Only add edge if both nodes exist
    if (!this.graph.nodes.has(source) || !this.graph.nodes.has(target)) {
      return;
    }

    // Avoid duplicate edges
    const existingEdge = this.graph.edges.find(
      e => e.source === source && e.target === target
    );
    if (existingEdge) {
      return;
    }

    const edge: Edge = {
      source,
      target,
      type: 'import',
      imports,
    };

    this.graph.edges.push(edge);

    // Update adjacency lists
    if (!this.graph.adjacencyList.has(source)) {
      this.graph.adjacencyList.set(source, []);
    }
    this.graph.adjacencyList.get(source)!.push(target);

    if (!this.graph.reverseAdjacencyList.has(target)) {
      this.graph.reverseAdjacencyList.set(target, []);
    }
    this.graph.reverseAdjacencyList.get(target)!.push(source);
  }

  /**
   * Index a file for import resolution
   * Creates multiple lookup entries for different import styles
   */
  private indexFile(filePath: string): void {
    // Store absolute path
    this.filePathMap.set(filePath, filePath);

    // Store relative to repo root
    const relPath = relative(this.repoRoot, filePath);
    this.filePathMap.set(relPath, filePath);

    // Store without extension
    const ext = extname(filePath);
    if (ext) {
      const withoutExt = filePath.slice(0, -ext.length);
      this.filePathMap.set(withoutExt, filePath);

      const relWithoutExt = relPath.slice(0, -ext.length);
      this.filePathMap.set(relWithoutExt, filePath);

      // Module-style keys (e.g., Halogen/VDom/DOM -> Halogen.VDom.DOM)
      const moduleKey = relWithoutExt.replace(/\\/g, '/').replace(/\//g, '.');
      this.filePathMap.set(moduleKey, filePath);

      // If under src/, also register path without the leading src.
      if (moduleKey.startsWith('src.')) {
        const trimmed = moduleKey.slice(4);
        this.filePathMap.set(trimmed, filePath);
      }
    }
  }

  /**
   * Resolve an import path to an actual file path
   */
  resolveImport(importPath: string, fromFile: string): string | null {
    // Direct map hit
    if (this.filePathMap.has(importPath)) {
      return this.filePathMap.get(importPath)!;
    }

    // If it's already in our map, return it
    if (this.filePathMap.has(importPath)) {
      return this.filePathMap.get(importPath)!;
    }

    // Resolve relative imports
    if (importPath.startsWith('.')) {
      const fromDir = dirname(fromFile);

      // Strip .js extension if present (TypeScript/ESM convention)
      let pathToResolve = importPath;
      if (pathToResolve.endsWith('.js')) {
        pathToResolve = pathToResolve.slice(0, -3);
      }

      const resolved = resolve(fromDir, pathToResolve);

      // Try exact match
      if (this.filePathMap.has(resolved)) {
        return this.filePathMap.get(resolved)!;
      }

      // Try with extensions
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.purs', '.hs', '.lhs'];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (this.filePathMap.has(withExt)) {
          return this.filePathMap.get(withExt)!;
        }
      }

      // Try index files
      for (const ext of extensions) {
        const indexPath = join(resolved, `index${ext}`);
        if (this.filePathMap.has(indexPath)) {
          return this.filePathMap.get(indexPath)!;
        }
      }

      // Try checking filesystem as fallback
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (existsSync(withExt)) {
          return withExt;
        }
      }

      const indexPath = join(resolved, 'index.ts');
      if (existsSync(indexPath)) {
        return indexPath;
      }
    }

    // Try module-style resolution for Haskell/PureScript (Module.Name)
    const moduleKey = importPath.replace(/\./g, '.');
    if (this.filePathMap.has(moduleKey)) {
      return this.filePathMap.get(moduleKey)!;
    }

    // Could not resolve
    return null;
  }

  /**
   * Process all imports for a parsed file and create edges
   */
  processImports(parsedFile: ParsedFile): void {
    for (const imp of parsedFile.imports) {
      const target = this.resolveImport(imp.source, parsedFile.filePath);
      if (target) {
        this.addEdge(parsedFile.filePath, target, imp.names);
      }
    }
  }

  /**
   * Build the complete graph
   */
  build(): Graph {
    return this.graph;
  }
}

/**
 * Build a graph from an array of parsed files
 */
export function buildGraph(parsedFiles: ParsedFile[], repoRoot?: string): Graph {
  const builder = new GraphBuilder(repoRoot);

  // First pass: add all nodes
  for (const parsedFile of parsedFiles) {
    builder.addNode(parsedFile);
  }

  // Second pass: process imports and create edges
  for (const parsedFile of parsedFiles) {
    builder.processImports(parsedFile);
  }

  return builder.build();
}

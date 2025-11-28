/**
 * Core type definitions for CodeMap
 * All tools and parsers use these normalized types
 */

export type Language = 'typescript' | 'javascript' | 'haskell' | 'purescript';

export type FileType = 'entry' | 'hub' | 'aggregator' | 'util' | 'leaf';

/**
 * Represents an import statement in a file
 */
export interface ImportDeclaration {
  source: string;           // The module being imported (e.g., './utils', 'react')
  names: string[];          // Named imports (e.g., ['foo', 'bar'])
  isDefault?: boolean;      // True if default import
  isNamespace?: boolean;    // True if namespace import (import * as X)
  line?: number;            // Line number in source file
}

/**
 * Represents a code definition (function, class, type, etc.)
 */
export interface Definition {
  name: string;             // Name of the definition
  type: 'function' | 'class' | 'type' | 'interface' | 'variable' | 'const';
  line: number;             // Line number where defined
  exported?: boolean;       // Whether it's exported
}

/**
 * Normalized output from any language parser
 * This is the contract between parsers and the rest of the system
 */
export interface ParsedFile {
  filePath: string;         // Absolute or repo-relative path
  language: Language;
  imports: ImportDeclaration[];
  exports: string[];        // List of exported names
  definitions: Definition[];
}

/**
 * Graph node representing a source file
 */
export interface Node {
  id: string;               // Unique identifier (typically the file path)
  filePath: string;         // Absolute path to the file
  language: Language;
  metadata?: {
    loc?: number;           // Lines of code
    definitions?: number;   // Number of definitions
    cluster?: string;       // Which cluster this belongs to
  };
}

/**
 * Graph edge representing a dependency between files
 */
export interface Edge {
  source: string;           // Source file path (imports from)
  target: string;           // Target file path (imports to)
  type: 'import';           // Edge type (extensible for future)
  imports?: string[];       // Specific symbols imported
}

/**
 * Dependency graph structure
 */
export interface Graph {
  nodes: Map<string, Node>;                    // filePath → Node
  edges: Edge[];                               // All edges
  adjacencyList: Map<string, string[]>;        // source → [targets] (what X imports)
  reverseAdjacencyList: Map<string, string[]>; // target → [sources] (what imports X)
}

/**
 * File with PageRank importance score
 */
export interface RankedFile {
  file: string;
  score: number;
  rank: number;             // 1-based rank (1 = most important)
  inDegree?: number;        // How many files import this
  outDegree?: number;       // How many files this imports
}

/**
 * Entry point classification
 */
export interface EntryPoint {
  file: string;
  inDegree: number;         // How many depend on this
  outDegree: number;        // How many this depends on
  type: FileType;
  reason?: string;          // Why it was classified this way
}

/**
 * Module cluster (group of related files)
 */
export interface Cluster {
  clusterId: string;
  name: string;
  files: string[];
  description?: string;
  cohesion?: number;        // 0-1, how tightly connected internally
  pattern?: string;         // Detected pattern (e.g., 'MVC', 'Service Layer')
}

/**
 * Detected architectural pattern
 */
export interface Pattern {
  pattern: string;          // Name of the pattern
  confidence: number;       // 0-1 confidence score
  evidence: string[];       // Evidence for this pattern
}

/**
 * Detailed context about a specific file
 */
export interface FileContext {
  filePath: string;
  content: string;          // Actual file contents
  summary?: string;         // Summary of what the file does
  imports: ImportDeclaration[];
  importedBy: string[];     // Files that import this
  exports: string[];
  definitions: Definition[];
  cluster?: string;
  role?: FileType;
  pageRankScore?: number;
  relatedFiles?: string[];  // Files in same cluster
}

/**
 * Repository scan results
 */
export interface ScanResult {
  files: string[];
  languages: Language[];
  stats: {
    totalFiles: number;
    totalLoc: number;
    byLanguage: Record<string, number>;
  };
}

/**
 * Tool input/output types
 */

export interface ScanRepoInput {
  repoPath: string;
  excludeDirs?: string[];
}

export interface ScanRepoOutput extends ScanResult {}

export interface ParseFileInput {
  filePath: string;
}

export interface ParseFileOutput extends ParsedFile {}

export interface BuildGraphInput {
  parsedFiles: ParsedFile[];
  repoRoot?: string;        // For resolving relative paths
}

export interface BuildGraphOutput {
  graph: Graph;
}

export interface RankImportanceInput {
  graph: Graph;
  iterations?: number;
  dampingFactor?: number;
}

export interface RankImportanceOutput {
  rankedFiles: RankedFile[];
}

export interface FindEntryPointsInput {
  graph: Graph;
}

export interface FindEntryPointsOutput {
  entryPoints: EntryPoint[];
}

export interface DetectClustersInput {
  graph: Graph;
  repoRoot?: string;
}

export interface DetectClustersOutput {
  clusters: Cluster[];
}

export interface DetectPatternsInput {
  graph: Graph;
  files: string[];
  repoRoot?: string;
}

export interface DetectPatternsOutput {
  patterns: Pattern[];
}

export interface GetFileContextInput {
  filePath: string;
  graph: Graph;
  clusters?: Cluster[];
  rankedFiles?: RankedFile[];
}

export interface GetFileContextOutput extends FileContext {}

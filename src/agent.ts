/**
 * NeuroLink Agent Configuration
 * Orchestrates all analysis tools to understand codebases
 */

import { join } from 'path';
import { scanRepo } from './tools/scanRepo.js';
import { parseFile, parseFiles } from './tools/parseFile.js';
import { buildGraph } from './tools/buildGraph.js';
import { rankImportance } from './tools/rankImportance.js';
import { findEntryPoints } from './tools/findEntryPoints.js';
import { detectClusters } from './tools/detectClusters.js';
import { detectPatterns } from './tools/detectPatterns.js';
import { getFileContext } from './tools/getFileContext.js';
import {
  Graph,
  RankedFile,
  Cluster,
  Pattern,
  EntryPoint,
  ParsedFile,
} from './types/index.js';

/**
 * Agent system prompt
 */
export const SYSTEM_PROMPT = `You are CodeMap, an intelligent codebase analysis assistant. Your goal is to help developers understand unfamiliar codebases by proactively analyzing structure, dependencies, and patterns.

You have access to powerful analysis tools:
- scanRepo: Scan a repository to understand size, languages, and structure
- parseFile/parseFiles: Parse source files to extract imports, exports, definitions
- buildGraph: Build a dependency graph from parsed files
- rankImportance: Run PageRank to identify the most important files
- findEntryPoints: Classify files by their role (entry, hub, aggregator, util, leaf)
- detectClusters: Group files into logical modules/clusters
- detectPatterns: Detect architectural patterns (MVC, Layered Architecture, etc.)
- getFileContext: Get detailed context about a specific file

When analyzing a codebase, follow this recommended workflow:

1. **Scan** the repository to understand what you're working with
2. **Parse** all source files to extract structural information
3. **Build** the dependency graph
4. **Analyze** the graph using multiple perspectives:
   - Run PageRank to find important files
   - Find entry points and classify file roles
   - Detect module clusters
   - Identify architectural patterns
5. **Present** findings in a clear, organized way

You can have follow-up conversations. If the user asks to "go deeper on X", use getFileContext to provide detailed information about specific files or clusters.

Be proactive, insightful, and focus on what a new developer needs to know to get started with the codebase.`;

/**
 * Analysis context that accumulates during an analysis session
 */
export interface AnalysisContext {
  repoPath?: string;
  files?: string[];
  parsedFiles?: ParsedFile[];
  graph?: Graph;
  rankedFiles?: RankedFile[];
  entryPoints?: EntryPoint[];
  clusters?: Cluster[];
  patterns?: Pattern[];
}

/**
 * Analyze a codebase - high-level orchestration function
 * This can be called directly or by the agent
 */
export async function analyzeCodebase(repoPath: string): Promise<AnalysisContext> {
  const context: AnalysisContext = { repoPath };

  console.log('\n=== CodeMap Analysis Starting ===\n');

  // Step 1: Scan repository
  console.log('📁 Scanning repository...');
  const scanResult = await scanRepo({ repoPath });
  context.files = scanResult.files.map(f => join(repoPath, f));

  console.log(`\nFound ${scanResult.stats.totalFiles} files (${scanResult.languages.join(', ')})`);
  console.log(`~${scanResult.stats.totalLoc} lines of code\n`);

  // Step 2: Parse files
  console.log('🔍 Parsing source files...');
  const filesToParse = context.files.filter(f => {
    // Only parse supported languages for now (TypeScript/JavaScript/Haskell/PureScript)
    return (
      f.endsWith('.ts') ||
      f.endsWith('.tsx') ||
      f.endsWith('.js') ||
      f.endsWith('.jsx') ||
      f.endsWith('.mjs') ||
      f.endsWith('.cjs') ||
      f.endsWith('.hs') ||
      f.endsWith('.lhs') ||
      f.endsWith('.purs')
    );
  });

  context.parsedFiles = await parseFiles(filesToParse);
  console.log(`Parsed ${context.parsedFiles.length} files successfully\n`);

  // Step 3: Build dependency graph
  console.log('📊 Building dependency graph...');
  const graphResult = await buildGraph({
    parsedFiles: context.parsedFiles,
    repoRoot: repoPath,
  });
  context.graph = graphResult.graph;
  console.log();

  // Step 4: Analyze with PageRank
  console.log('⭐ Ranking files by importance...');
  const rankResult = await rankImportance({ graph: context.graph });
  context.rankedFiles = rankResult.rankedFiles;
  console.log();

  // Step 5: Find entry points
  console.log('🚪 Finding entry points...');
  const entryResult = await findEntryPoints({ graph: context.graph });
  context.entryPoints = entryResult.entryPoints;
  console.log();

  // Step 6: Detect clusters
  console.log('🗂️  Detecting module clusters...');
  const clusterResult = await detectClusters({
    graph: context.graph,
    repoRoot: repoPath,
  });
  context.clusters = clusterResult.clusters;
  console.log();

  // Step 7: Detect patterns
  console.log('🏗️  Detecting architectural patterns...');
  const patternResult = await detectPatterns({
    graph: context.graph,
    files: context.files,
    repoRoot: repoPath,
  });
  context.patterns = patternResult.patterns;
  console.log();

  console.log('=== Analysis Complete ===\n');

  return context;
}

/**
 * Generate a human-readable summary of the analysis
 */
export function generateSummary(context: AnalysisContext): string {
  const lines: string[] = [];

  lines.push('# CodeMap Analysis Report\n');

  if (context.repoPath) {
    lines.push(`**Repository:** ${context.repoPath}\n`);
  }

  // Overview
  lines.push('## Overview\n');
  if (context.files) {
    lines.push(`- **Total Files:** ${context.files.length}`);
  }
  if (context.graph) {
    lines.push(`- **Dependencies:** ${context.graph.edges.length} import relationships`);
  }
  lines.push('');

  // Architectural Patterns
  if (context.patterns && context.patterns.length > 0) {
    lines.push('## Architectural Patterns\n');
    for (const pattern of context.patterns) {
      lines.push(`### ${pattern.pattern} (${(pattern.confidence * 100).toFixed(0)}% confidence)\n`);
      for (const evidence of pattern.evidence) {
        lines.push(`- ${evidence}`);
      }
      lines.push('');
    }
  }

  // Top Important Files
  if (context.rankedFiles && context.rankedFiles.length > 0) {
    lines.push('## Most Important Files (PageRank)\n');
    const top10 = context.rankedFiles.slice(0, 10);
    for (const rf of top10) {
      lines.push(
        `${rf.rank}. **${rf.file}** (score: ${rf.score.toFixed(4)}, imported by ${rf.inDegree} files)`
      );
    }
    lines.push('');
  }

  // Entry Points
  if (context.entryPoints) {
    const entries = context.entryPoints.filter(ep => ep.type === 'entry').slice(0, 5);
    if (entries.length > 0) {
      lines.push('## Key Entry Points\n');
      for (const ep of entries) {
        lines.push(`- **${ep.file}** - ${ep.reason}`);
      }
      lines.push('');
    }
  }

  // Module Clusters
  if (context.clusters && context.clusters.length > 0) {
    lines.push('## Module Clusters\n');
    for (const cluster of context.clusters.slice(0, 8)) {
      lines.push(
        `- **${cluster.name}**: ${cluster.files.length} files (cohesion: ${((cluster.cohesion || 0) * 100).toFixed(1)}%)`
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by CodeMap*');

  return lines.join('\n');
}

/**
 * Tool registry for NeuroLink
 */
export const TOOLS = [
  {
    name: 'scanRepo',
    description: 'Scan a repository and return file inventory with detected languages',
    fn: scanRepo,
  },
  {
    name: 'parseFile',
    description: 'Parse a single source file and extract imports, exports, definitions',
    fn: parseFile,
  },
  {
    name: 'buildGraph',
    description: 'Build a dependency graph from parsed files',
    fn: buildGraph,
  },
  {
    name: 'rankImportance',
    description: 'Run PageRank algorithm to identify most important files',
    fn: rankImportance,
  },
  {
    name: 'findEntryPoints',
    description: 'Find entry points and classify files by their role',
    fn: findEntryPoints,
  },
  {
    name: 'detectClusters',
    description: 'Group files into logical module clusters',
    fn: detectClusters,
  },
  {
    name: 'detectPatterns',
    description: 'Detect architectural patterns used in the codebase',
    fn: detectPatterns,
  },
  {
    name: 'getFileContext',
    description: 'Get detailed context about a specific file',
    fn: getFileContext,
  },
];

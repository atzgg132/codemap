/**
 * getFileContext Tool
 * Gets detailed context about a specific file for deeper exploration
 */

import { readFile } from 'fs/promises';
import { GetFileContextInput, GetFileContextOutput, FileContext } from '../types/index.js';
import { getImporters, getImports } from '../graph/types.js';
import { parseFile } from './parseFile.js';

/**
 * Get detailed context about a specific file
 */
export async function getFileContext(
  input: GetFileContextInput
): Promise<GetFileContextOutput> {
  const { filePath, graph, clusters, rankedFiles } = input;

  // Check if file exists in graph
  const node = graph.nodes.get(filePath);
  if (!node) {
    throw new Error(`File not found in graph: ${filePath}`);
  }

  console.log(`Getting context for ${filePath}...`);

  // Read file content
  const content = await readFile(filePath, 'utf-8');

  // Parse the file to get fresh import/export data
  const parsed = await parseFile({ filePath });

  // Get dependencies
  const imports = parsed.imports;
  const importedBy = getImporters(graph, filePath);
  const exports = parsed.exports;
  const definitions = parsed.definitions;

  // Find which cluster this file belongs to
  let cluster: string | undefined;
  if (clusters) {
    for (const c of clusters) {
      if (c.files.includes(filePath)) {
        cluster = c.name;
        break;
      }
    }
  }

  // Find related files (same cluster)
  let relatedFiles: string[] | undefined;
  if (clusters) {
    for (const c of clusters) {
      if (c.files.includes(filePath)) {
        relatedFiles = c.files.filter(f => f !== filePath);
        break;
      }
    }
  }

  // Get PageRank score
  let pageRankScore: number | undefined;
  let role: GetFileContextOutput['role'];
  if (rankedFiles) {
    const ranked = rankedFiles.find(rf => rf.file === filePath);
    if (ranked) {
      pageRankScore = ranked.score;

      // Determine role based on rank
      if (ranked.rank <= 10) {
        role = 'entry';
      } else if (ranked.rank <= 50) {
        role = 'hub';
      } else {
        role = 'util';
      }
    }
  }

  // Generate summary from first comment block or first few lines
  const summary = extractSummary(content);

  const context: FileContext = {
    filePath,
    content,
    summary,
    imports,
    importedBy,
    exports,
    definitions,
    cluster,
    role,
    pageRankScore,
    relatedFiles,
  };

  console.log(`Context retrieved:`);
  console.log(`  - ${definitions.length} definitions`);
  console.log(`  - ${imports.length} imports`);
  console.log(`  - Imported by ${importedBy.length} files`);
  if (cluster) console.log(`  - Part of ${cluster} cluster`);

  return context;
}

/**
 * Extract summary from file content
 * Looks for leading comment block or uses first few lines
 */
function extractSummary(content: string): string | undefined {
  const lines = content.split('\n');

  // Look for leading block comment
  const blockCommentMatch = content.match(/^\/\*\*?([\s\S]*?)\*\//);
  if (blockCommentMatch) {
    const comment = blockCommentMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line.length > 0)
      .join(' ');

    return comment.slice(0, 200); // Limit to 200 chars
  }

  // Look for leading line comments
  const leadingComments: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      leadingComments.push(trimmed.replace(/^\/\/\s?/, ''));
    } else if (trimmed.length > 0) {
      break; // Stop at first non-comment line
    }
  }

  if (leadingComments.length > 0) {
    return leadingComments.join(' ').slice(0, 200);
  }

  // Fallback: use first non-empty line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('import') && !trimmed.startsWith('export')) {
      return trimmed.slice(0, 100);
    }
  }

  return undefined;
}

/**
 * Tool metadata for NeuroLink agent
 */
export const getFileContextTool = {
  name: 'getFileContext',
  description: `Gets detailed context about a specific file for deeper exploration.

    Use this tool when:
    - User asks to "go deeper" on a specific file
    - You need to understand what a specific file does
    - You want to see the full content and metadata of a file

    Input: { filePath: string, graph: Graph, clusters?: Cluster[], rankedFiles?: RankedFile[] }
    Output: Complete file context including:
    - content: Full file source code
    - summary: Extracted from comments or first lines
    - imports: What this file imports
    - importedBy: What files import this
    - exports: What this file exports
    - definitions: Functions, classes, types defined
    - cluster: Which module cluster it belongs to
    - role: Its role in the codebase (entry, hub, util, leaf)
    - pageRankScore: Importance score
    - relatedFiles: Other files in the same cluster`,
  fn: getFileContext,
};

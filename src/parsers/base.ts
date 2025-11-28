/**
 * Base parser interface and utilities
 */

import { ParsedFile } from '../types/index.js';

/**
 * Interface that all language parsers must implement
 */
export interface Parser {
  /**
   * Parse a source file and extract structural information
   */
  parse(filePath: string): Promise<ParsedFile>;
}

/**
 * Normalize import paths
 * Handles relative paths, aliases, and external modules
 */
export function normalizeImportPath(
  importPath: string,
  currentFilePath: string,
  repoRoot?: string
): string {
  // External module (no ./ or ../)
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return importPath; // Keep as-is (e.g., 'react', 'lodash')
  }

  // Already absolute
  if (importPath.startsWith('/')) {
    return importPath;
  }

  // Relative path - keep as-is for now
  // The graph builder will resolve these to actual files
  return importPath;
}

/**
 * Check if an import is external (from node_modules)
 */
export function isExternalImport(importPath: string): boolean {
  return !importPath.startsWith('.') && !importPath.startsWith('/');
}

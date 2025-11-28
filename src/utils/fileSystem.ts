/**
 * File system utilities for scanning and reading files
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import { Language } from '../types/index.js';

/**
 * Default directories to exclude from scanning
 */
export const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  'target',
  '.stack-work',
  '.cabal-sandbox',
];

/**
 * Map file extensions to languages
 */
export const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.purs': 'purescript',
};

/**
 * Check if a directory should be excluded
 */
export function shouldExcludeDir(dirName: string, excludeDirs: string[]): boolean {
  return excludeDirs.some(excluded => dirName === excluded || dirName.startsWith('.'));
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): Language | null {
  const ext = extname(filePath);
  return EXTENSION_TO_LANGUAGE[ext] || null;
}

/**
 * Recursively walk a directory and collect all files (source + metadata)
 */
export async function walkDirectory(
  dirPath: string,
  excludeDirs: string[] = DEFAULT_EXCLUDE_DIRS,
  baseDir: string = dirPath
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!shouldExcludeDir(entry.name, excludeDirs)) {
          const subFiles = await walkDirectory(fullPath, excludeDirs, baseDir);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        // Store relative path from base directory for every file (we filter for parsing later)
        const relativePath = relative(baseDir, fullPath);
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dirPath}:`, error);
  }

  return files;
}

/**
 * Count lines of code in a file (non-empty, non-comment lines)
 * Simple heuristic: just count non-empty lines for now
 */
export async function countLinesOfCode(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    return nonEmptyLines.length;
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}:`, error);
    return 0;
  }
}

/**
 * Check if a path exists and is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

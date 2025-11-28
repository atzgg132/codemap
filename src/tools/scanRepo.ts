/**
 * scanRepo Tool
 * Scans a repository and returns file inventory with detected languages
 */

import { join, resolve } from 'path';
import { Language, ScanRepoInput, ScanRepoOutput } from '../types/index.js';
import {
  walkDirectory,
  detectLanguage,
  countLinesOfCode,
  isDirectory,
  DEFAULT_EXCLUDE_DIRS,
} from '../utils/fileSystem.js';

/**
 * Scan a repository and analyze its structure
 */
export async function scanRepo(input: ScanRepoInput): Promise<ScanRepoOutput> {
  const { repoPath, excludeDirs = DEFAULT_EXCLUDE_DIRS } = input;

  // Resolve to absolute path
  const absolutePath = resolve(repoPath);

  // Check if path exists and is a directory
  if (!(await isDirectory(absolutePath))) {
    throw new Error(`Path does not exist or is not a directory: ${repoPath}`);
  }

  console.log(`Scanning repository: ${absolutePath}`);

  // Walk directory tree and collect all source files
  const relativeFiles = await walkDirectory(absolutePath, excludeDirs);

  // Convert to absolute paths for further processing
  const files = relativeFiles.map(f => join(absolutePath, f));

  // Detect languages
  const languageSet = new Set<Language>();
  const languageCounts: Record<string, number> = {};

  for (const file of files) {
    const language = detectLanguage(file);
    if (language) {
      languageSet.add(language);
      languageCounts[language] = (languageCounts[language] || 0) + 1;
    }
  }

  const languages = Array.from(languageSet);

  // Count total LOC (sampling for large repos to avoid timeout)
  let totalLoc = 0;
  const maxFilesToCount = 1000; // Only count LOC for first 1000 files
  const filesToCount = files.slice(0, maxFilesToCount);

  console.log(`Counting lines of code for ${filesToCount.length} files...`);

  const locPromises = filesToCount.map(file => countLinesOfCode(file));
  const locResults = await Promise.all(locPromises);
  totalLoc = locResults.reduce((sum, loc) => sum + loc, 0);

  // Estimate total LOC if we sampled
  if (files.length > maxFilesToCount) {
    const avgLoc = totalLoc / maxFilesToCount;
    totalLoc = Math.round(avgLoc * files.length);
  }

  // Store relative paths for output (cleaner)
  const outputFiles = relativeFiles;

  console.log(`Scan complete: ${files.length} files, ${languages.join(', ')}, ~${totalLoc} LOC`);

  return {
    files: outputFiles,
    languages,
    stats: {
      totalFiles: files.length,
      totalLoc,
      byLanguage: languageCounts,
    },
  };
}

/**
 * Tool metadata for NeuroLink agent
 */
export const scanRepoTool = {
  name: 'scanRepo',
  description: `Scans a repository and returns file inventory with detected languages.

    Use this tool when you need to:
    - Understand the size and scope of a codebase
    - Identify what programming languages are used
    - Get a list of all source files

    Input: { repoPath: string, excludeDirs?: string[] }
    Output: { files: string[], languages: string[], stats: {...} }`,
  fn: scanRepo,
};

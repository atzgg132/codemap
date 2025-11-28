/**
 * parseFile Tool
 * Parses a single file using Tree-sitter and extracts structural information
 */

import { ParseFileInput, ParseFileOutput } from '../types/index.js';
import { detectLanguage } from '../utils/fileSystem.js';
import { getParser } from '../parsers/index.js';

/**
 * Parse a source file and extract imports, exports, definitions
 */
export async function parseFile(input: ParseFileInput): Promise<ParseFileOutput> {
  const { filePath } = input;

  // Detect language from file extension
  const language = detectLanguage(filePath);
  if (!language) {
    throw new Error(`Could not detect language for file: ${filePath}`);
  }

  // Get appropriate parser
  const parser = getParser(language);

  // Parse the file
  const result = await parser.parse(filePath);

  return result;
}

/**
 * Parse multiple files in parallel
 */
export async function parseFiles(filePaths: string[]): Promise<ParseFileOutput[]> {
  const parsePromises = filePaths.map(filePath =>
    parseFile({ filePath }).catch(error => {
      console.warn(`Warning: Failed to parse ${filePath}:`, error.message);
      return null;
    })
  );

  const results = await Promise.all(parsePromises);

  // Filter out failed parses
  return results.filter((r): r is ParseFileOutput => r !== null);
}

/**
 * Tool metadata for NeuroLink agent
 */
export const parseFileTool = {
  name: 'parseFile',
  description: `Parses a single source file and extracts structural information (imports, exports, definitions).

    Use this tool when you need to:
    - Understand what a file imports and exports
    - See what functions, classes, types are defined in a file
    - Extract dependencies for building a dependency graph

    Supported languages: TypeScript, JavaScript

    Input: { filePath: string }
    Output: { filePath, language, imports: [...], exports: [...], definitions: [...] }`,
  fn: parseFile,
};

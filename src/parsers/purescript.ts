/**
 * PureScript parser with regex-based extraction (Tree-sitter grammar not available on npm).
 * Keeps output consistent with other parsers.
 */

import { readFile } from 'fs/promises';
import { ParsedFile, ImportDeclaration, Definition } from '../types/index.js';
import { Parser as IParser, normalizeImportPath, isExternalImport } from './base.js';

export class PureScriptParserImpl implements IParser {
  async parse(filePath: string): Promise<ParsedFile> {
    const content = await readFile(filePath, 'utf-8');

    const imports = this.extractImports(content, filePath);
    const exports = this.extractExports(content);
    const definitions = this.extractDefinitions(content);

    return {
      filePath,
      language: 'purescript',
      // Keep imports even if they look external; module-name resolution happens later
      imports,
      exports,
      definitions,
    };
  }

  private extractImports(content: string, filePath: string): ImportDeclaration[] {
    const imports: ImportDeclaration[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const match = line.match(/^\s*import\s+([A-Za-z0-9_.']+)(\s+as\s+[A-Za-z0-9_.']+)?(\s+\(([^)]*)\))?/);
      if (match) {
        const names = match[4]
          ? match[4].split(',').map(s => s.trim()).filter(Boolean)
          : [];
        imports.push({
          source: normalizeImportPath(match[1], filePath),
          names,
          line: idx + 1,
        });
      }
    });

    return imports;
  }

  private extractExports(content: string): string[] {
    const headerMatch = content.match(/^module\s+[A-Za-z0-9_.']+\s*\(([^)]*)\)/m);
    if (!headerMatch || !headerMatch[1]) return [];

    return headerMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  private extractDefinitions(content: string): Definition[] {
    const defs: Definition[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const typeSigMatch = line.match(/^([a-zA-Z_][\w']*)\s*::/);
      if (typeSigMatch) {
        defs.push({
          name: typeSigMatch[1],
          type: 'function',
          line: idx + 1,
        });
      } else {
        const valueMatch = line.match(/^([a-zA-Z_][\w']*)\s*=/);
        if (valueMatch) {
          defs.push({
            name: valueMatch[1],
            type: 'variable',
            line: idx + 1,
          });
        }
      }
    });

    return defs;
  }
}

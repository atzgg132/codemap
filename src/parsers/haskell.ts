/**
 * Haskell parser using Tree-sitter when available, with regex fallbacks for resilience.
 */

import Parser from 'tree-sitter';
import Haskell from 'tree-sitter-haskell';
import { readFile } from 'fs/promises';
import { stat } from 'fs/promises';
import { ParsedFile, ImportDeclaration, Definition } from '../types/index.js';
import { Parser as IParser, normalizeImportPath, isExternalImport } from './base.js';

export class HaskellParserImpl implements IParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    // Use Haskell grammar when present; Tree-sitter may still throw on malformed code
    this.parser.setLanguage(Haskell);
  }

  async parse(filePath: string): Promise<ParsedFile> {
    const fileStats = await stat(filePath);
    const content = await readFile(filePath, 'utf-8');

    let imports: ImportDeclaration[] = [];
    let exports: string[] = [];
    let definitions: Definition[] = [];

    const isLarge = fileStats.size > 200_000; // ~200 KB, skip Tree-sitter for very large files

    if (!isLarge) {
      try {
        const tree = this.parser.parse(content);
        const root = tree.rootNode;
        imports = this.extractImports(root, filePath);
        exports = this.extractExports(root, content);
        definitions = this.extractDefinitions(root);
      } catch (error) {
        console.warn(`Warning: Haskell parser fallback for ${filePath}:`, (error as Error).message);
        ({ imports, exports, definitions } = this.extractFallback(content, filePath));
      }
    } else {
      ({ imports, exports, definitions } = this.extractFallback(content, filePath));
    }

    // If imports are empty, try regex fallback to capture simple imports
    if (imports.length === 0) {
      imports = this.extractFallback(content, filePath).imports;
    }

    return {
      filePath,
      language: 'haskell',
      // Keep imports even if they look external; module-name resolution happens later
      imports,
      exports,
      definitions,
    };
  }

  private extractImports(root: Parser.SyntaxNode, filePath: string): ImportDeclaration[] {
    const results: ImportDeclaration[] = [];
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'import') {
        const text = node.text;
        const match = text.match(/^import\s+(qualified\s+)?([A-Za-z0-9_.']+)(\s+as\s+([A-Za-z0-9_'.]+))?\s*(\(([^)]*)\))?/);
        if (match) {
          const namesRaw = match[6];
          const names = namesRaw
            ? namesRaw.split(',').map(s => s.trim()).filter(Boolean)
            : [];
          results.push({
            source: normalizeImportPath(match[2], filePath),
            names,
            line: node.startPosition.row + 1,
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) traverse(child);
      }
    };
    traverse(root);
    return results;
  }

  private extractExports(root: Parser.SyntaxNode, content: string): string[] {
    // Tree-sitter Haskell doesn't always expose exports cleanly; use header as backup
    const headerMatch = content.match(/^module\s+[A-Za-z0-9_.']+\s*\(([^)]*)\)/m);
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1]
        .split(',')
        .map(s => s.replace(/\s+as\s+.*/, '').trim())
        .filter(Boolean);
    }
    return [];
  }

  private extractDefinitions(root: Parser.SyntaxNode): Definition[] {
    const defs: Definition[] = [];
    const seen = new Set<string>();
    const traverse = (node: Parser.SyntaxNode) => {
      // Function or value bindings
      if (node.type === 'function' || node.type === 'value_declaration' || node.type === 'pattern') {
        const name = node.childForFieldName('name')?.text || node.child(0)?.text;
        if (name && !seen.has(name)) {
          seen.add(name);
          defs.push({
            name,
            type: 'function',
            line: node.startPosition.row + 1,
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) traverse(child);
      }
    };
    traverse(root);
    return defs;
  }

  /**
   * Regex-based fallback for when Tree-sitter cannot parse the file.
   */
  private extractFallback(content: string, filePath: string): {
    imports: ImportDeclaration[];
    exports: string[];
    definitions: Definition[];
  } {
    const imports: ImportDeclaration[] = [];
    const exports: string[] = [];
    const definitions: Definition[] = [];

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const importMatch = line.match(/^\s*import\s+(qualified\s+)?([A-Za-z0-9_.']+)(\s*\(([^)]*)\))?/);
      if (importMatch) {
        const names = importMatch[4]
          ? importMatch[4].split(',').map(s => s.trim()).filter(Boolean)
          : [];
        imports.push({
          source: normalizeImportPath(importMatch[2], filePath),
          names,
          line: idx + 1,
        });
      }

      const typeSigMatch = line.match(/^([a-zA-Z_][\w']*)\s*::/);
      if (typeSigMatch) {
        definitions.push({
          name: typeSigMatch[1],
          type: 'function',
          line: idx + 1,
        });
      } else {
        const valueMatch = line.match(/^([a-zA-Z_][\w']*)\s*=/);
        if (valueMatch) {
          definitions.push({
            name: valueMatch[1],
            type: 'variable',
            line: idx + 1,
          });
        }
      }
    });

    const headerMatch = content.match(/^module\s+[A-Za-z0-9_.']+\s*\(([^)]*)\)/m);
    if (headerMatch && headerMatch[1]) {
      exports.push(
        ...headerMatch[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      );
    }

    return { imports, exports, definitions };
  }
}

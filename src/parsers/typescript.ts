/**
 * TypeScript/JavaScript parser using tree-sitter
 */

import Parser from 'tree-sitter';
import TypeScriptParser from 'tree-sitter-typescript';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import {
  ParsedFile,
  ImportDeclaration,
  Definition,
  Language,
} from '../types/index.js';
import { Parser as IParser, normalizeImportPath, isExternalImport } from './base.js';

export class TypeScriptParserImpl implements IParser {
  private parser: Parser;
  private tsLanguage = TypeScriptParser.typescript;
  private tsxLanguage = TypeScriptParser.tsx;

  constructor() {
    this.parser = new Parser();
    // Use TypeScript grammar for both .ts and .tsx files
    this.parser.setLanguage(this.tsLanguage);
  }

  async parse(filePath: string): Promise<ParsedFile> {
    const content = await readFile(filePath, 'utf-8');
    const ext = extname(filePath);

    // Switch to TSX grammar for TSX/JSX to reduce parse failures
    if (ext === '.tsx' || ext === '.jsx') {
      this.parser.setLanguage(this.tsxLanguage);
    } else {
      this.parser.setLanguage(this.tsLanguage);
    }

    let imports: ImportDeclaration[] = [];
    let exports: string[] = [];
    let definitions: Definition[] = [];

    try {
      const tree = this.parser.parse(content);
      imports = this.extractImports(tree.rootNode, filePath);
      exports = this.extractExports(tree.rootNode);
      definitions = this.extractDefinitions(tree.rootNode);
    } catch (error) {
      console.warn(`Warning: TypeScript parser fallback for ${filePath}:`, (error as Error).message);
      ({ imports, exports, definitions } = this.extractFallback(content, filePath));
    }

    const commonJsExtras = this.extractCommonJS(content, filePath);
    imports.push(...commonJsExtras.imports);
    exports.push(...commonJsExtras.exports);
    definitions.push(...commonJsExtras.definitions);

    const language: Language = ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs'
      ? 'javascript'
      : 'typescript';

    return {
      filePath,
      language,
      imports: imports.filter(imp => !isExternalImport(imp.source)), // Filter out external modules for graph
      exports,
      definitions,
    };
  }

  /**
   * Extract import declarations from AST
   */
  private extractImports(node: Parser.SyntaxNode, filePath: string): ImportDeclaration[] {
    const imports: ImportDeclaration[] = [];

    const importNodes = this.findNodesByType(node, 'import_statement');
    const exportNodes = this.findNodesByType(node, 'export_statement');

    for (const importNode of importNodes) {
      // import_statement has named children: [import_clause, string]
      const importClause = importNode.namedChild(0);
      const sourceNode = importNode.namedChild(1);
      const source = this.extractStringLiteral(sourceNode);

      if (!source) continue;

      const names: string[] = [];
      let isDefault = false;
      let isNamespace = false;

      if (importClause && importClause.type === 'import_clause') {
        // Check for different import types
        for (let i = 0; i < importClause.namedChildCount; i++) {
          const child = importClause.namedChild(i);
          if (!child) continue;

          // Named imports: import { foo, bar } from './foo'
          if (child.type === 'named_imports') {
            const specifiers = this.findNodesByType(child, 'import_specifier');
            for (const spec of specifiers) {
              // Get first named child of import_specifier (the identifier)
              const name = spec.namedChild(0);
              if (name) {
                names.push(name.text);
              }
            }
          }
          // Default import: import Foo from './foo'
          else if (child.type === 'identifier') {
            names.push(child.text);
            isDefault = true;
          }
          // Namespace import: import * as Foo from './foo'
          else if (child.type === 'namespace_import') {
            const name = child.namedChild(0);
            if (name) {
              names.push(name.text);
              isNamespace = true;
            }
          }
        }
      }

      imports.push({
        source: normalizeImportPath(source, filePath),
        names,
        isDefault,
        isNamespace,
        line: importNode.startPosition.row + 1,
      });
    }

    // Re-export statements: export { foo } from './bar' or export * from './bar'
    for (const exportNode of exportNodes) {
      const sourceNode = exportNode.namedChild(exportNode.namedChildCount - 1);
      const source = this.extractStringLiteral(sourceNode);
      if (!source) continue;

      const names: string[] = [];
      const exportClause = exportNode.child(1);
      if (exportClause && exportClause.type === 'export_clause') {
        const specifiers = this.findNodesByType(exportClause, 'export_specifier');
        for (const spec of specifiers) {
          const name = spec.childForFieldName('name');
          if (name) {
            names.push(name.text);
          }
        }
      } else if (exportNode.text.startsWith('export *')) {
        names.push('*');
      }

      imports.push({
        source: normalizeImportPath(source, filePath),
        names,
        line: exportNode.startPosition.row + 1,
      });
    }

    // Also handle require() calls for CommonJS
    const requireCalls = this.findRequireCalls(node);
    for (const req of requireCalls) {
      imports.push({
        source: normalizeImportPath(req.source, filePath),
        names: req.names,
        line: req.line,
      });
    }

    return imports;
  }

  /**
   * Extract export declarations from AST
   */
  private extractExports(node: Parser.SyntaxNode): string[] {
    const exports: string[] = [];

    // export { foo, bar }
    const exportNodes = this.findNodesByType(node, 'export_statement');
    for (const exportNode of exportNodes) {
      const declaration = exportNode.childForFieldName('declaration');
      if (declaration) {
        const name = this.extractNameFromDeclaration(declaration);
        if (name) exports.push(name);
      }

      const exportClause = exportNode.child(1);
      if (exportClause && exportClause.type === 'export_clause') {
        const specifiers = this.findNodesByType(exportClause, 'export_specifier');
        for (const spec of specifiers) {
          const name = spec.childForFieldName('name');
          if (name) exports.push(name.text);
        }
      }
    }

    // export default ...
    const defaultExports = this.findNodesByType(node, 'export_statement')
      .filter(n => n.text.startsWith('export default'));
    if (defaultExports.length > 0) {
      exports.push('default');
    }

    return [...new Set(exports)]; // Deduplicate
  }

  /**
   * Extract function, class, type definitions from AST
   */
  private extractDefinitions(node: Parser.SyntaxNode): Definition[] {
    const definitions: Definition[] = [];

    // Function declarations
    const functions = this.findNodesByType(node, 'function_declaration');
    for (const fn of functions) {
      const name = fn.childForFieldName('name');
      if (name) {
        definitions.push({
          name: name.text,
          type: 'function',
          line: fn.startPosition.row + 1,
        });
      }
    }

    // Class declarations
    const classes = this.findNodesByType(node, 'class_declaration');
    for (const cls of classes) {
      const name = cls.childForFieldName('name');
      if (name) {
        definitions.push({
          name: name.text,
          type: 'class',
          line: cls.startPosition.row + 1,
        });
      }
    }

    // Type alias declarations
    const typeAliases = this.findNodesByType(node, 'type_alias_declaration');
    for (const typeAlias of typeAliases) {
      const name = typeAlias.childForFieldName('name');
      if (name) {
        definitions.push({
          name: name.text,
          type: 'type',
          line: typeAlias.startPosition.row + 1,
        });
      }
    }

    // Interface declarations
    const interfaces = this.findNodesByType(node, 'interface_declaration');
    for (const iface of interfaces) {
      const name = iface.childForFieldName('name');
      if (name) {
        definitions.push({
          name: name.text,
          type: 'interface',
          line: iface.startPosition.row + 1,
        });
      }
    }

    // Variable declarations (const, let, var)
    const variableDeclarations = this.findNodesByType(node, 'lexical_declaration');
    for (const varDecl of variableDeclarations) {
      const declarators = this.findNodesByType(varDecl, 'variable_declarator');
      for (const declarator of declarators) {
        const name = declarator.childForFieldName('name');
        if (name) {
          definitions.push({
            name: name.text,
            type: varDecl.text.startsWith('const') ? 'const' : 'variable',
            line: declarator.startPosition.row + 1,
          });
        }
      }
    }

    return definitions;
  }

  /**
   * Find all require() calls (CommonJS)
   */
  private findRequireCalls(node: Parser.SyntaxNode): Array<{
    source: string;
    names: string[];
    line: number;
  }> {
    const requires: Array<{ source: string; names: string[]; line: number }> = [];

    const callExpressions = this.findNodesByType(node, 'call_expression');
    for (const call of callExpressions) {
      const func = call.childForFieldName('function');
      if (func && func.text === 'require') {
        const args = call.childForFieldName('arguments');
        if (args && args.childCount > 0) {
          const firstArg = args.child(1); // Skip '('
          if (firstArg) {
            const source = this.extractStringLiteral(firstArg);
            if (source) {
              requires.push({
                source,
                names: [],
                line: call.startPosition.row + 1,
              });
            }
          }
        }
      }
    }

    return requires;
  }

  /**
   * Recursively find all nodes of a specific type
   */
  private findNodesByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
    const results: Parser.SyntaxNode[] = [];

    const traverse = (n: Parser.SyntaxNode) => {
      if (n.type === type) {
        results.push(n);
      }
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) traverse(child);
      }
    };

    traverse(node);
    return results;
  }

  /**
   * Extract string literal value (remove quotes)
   */
  private extractStringLiteral(node: Parser.SyntaxNode | null): string | null {
    if (!node) return null;
    const text = node.text;
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")) ||
      (text.startsWith('`') && text.endsWith('`'))
    ) {
      return text.slice(1, -1);
    }
    return null;
  }

  /**
   * Extract name from a declaration node
   */
  private extractNameFromDeclaration(node: Parser.SyntaxNode): string | null {
    const name = node.childForFieldName('name');
    return name ? name.text : null;
  }

  /**
   * Regex-based fallback when Tree-sitter cannot parse a file.
   */
  private extractFallback(
    content: string,
    filePath: string
  ): { imports: ImportDeclaration[]; exports: string[]; definitions: Definition[] } {
    const imports: ImportDeclaration[] = [];
    const exports: string[] = [];
    const definitions: Definition[] = [];

    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const importMatch = line.match(/^import\s+(.*)\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const rawNames = importMatch[1] || '';
        const names =
          rawNames.includes('{') && rawNames.includes('}')
            ? rawNames
                .replace(/^{|}$/g, '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            : rawNames.trim()
            ? [rawNames.trim()]
            : [];
        imports.push({
          source: normalizeImportPath(importMatch[2], filePath),
          names,
          line: idx + 1,
        });
      }

      const requireMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
      if (requireMatch) {
        imports.push({
          source: normalizeImportPath(requireMatch[1], filePath),
          names: [],
          line: idx + 1,
        });
      }

      const exportFromMatch = line.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/);
      if (exportFromMatch) {
        imports.push({
          source: normalizeImportPath(exportFromMatch[1], filePath),
          names: ['*'],
          line: idx + 1,
        });
      }

      const exportNamedFromMatch = line.match(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
      if (exportNamedFromMatch) {
        const names = exportNamedFromMatch[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        imports.push({
          source: normalizeImportPath(exportNamedFromMatch[2], filePath),
          names,
          line: idx + 1,
        });
        exports.push(...names);
      }

      const exportMatch = line.match(/^export\s+(?:const|let|var|function|class|type|interface)\s+([A-Za-z0-9_]+)/);
      if (exportMatch) {
        exports.push(exportMatch[1]);
      }

      const defMatch = line.match(/^(export\s+)?(function|class|interface|type|const|let|var)\s+([A-Za-z0-9_]+)/);
      if (defMatch) {
        const kind = defMatch[2];
        const name = defMatch[3];
        const type: Definition['type'] =
          kind === 'function'
            ? 'function'
            : kind === 'class'
            ? 'class'
            : kind === 'interface'
            ? 'interface'
            : kind === 'type'
            ? 'type'
            : kind === 'const'
            ? 'const'
            : 'variable';
        definitions.push({
          name,
          type,
          line: idx + 1,
          exported: !!defMatch[1],
        });
      }
    });

    return {
      imports,
      exports: [...new Set(exports)],
      definitions,
    };
  }

  /**
   * Detect CommonJS exports (module.exports, exports.foo) to improve JS coverage.
   */
  private extractCommonJS(
    content: string,
    filePath: string
  ): { imports: ImportDeclaration[]; exports: string[]; definitions: Definition[] } {
    const imports: ImportDeclaration[] = [];
    const exports: string[] = [];
    const definitions: Definition[] = [];

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const moduleExportsObject = line.match(/module\.exports\s*=\s*\{([^}]+)\}/);
      if (moduleExportsObject) {
        const names = moduleExportsObject[1]
          .split(',')
          .map(s => s.split(':')[0].trim())
          .filter(Boolean);
        exports.push(...names);
      }

      const moduleExportsAssign = line.match(/module\.exports\s*=\s*([A-Za-z0-9_]+)/);
      if (moduleExportsAssign) {
        exports.push('default');
        definitions.push({
          name: moduleExportsAssign[1],
          type: 'variable',
          line: idx + 1,
        });
      }

      const exportsAssign = line.match(/exports\.([A-Za-z0-9_]+)\s*=/);
      if (exportsAssign) {
        exports.push(exportsAssign[1]);
      }

      const requireMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
      if (requireMatch) {
        imports.push({
          source: normalizeImportPath(requireMatch[1], filePath),
          names: [],
          line: idx + 1,
        });
      }
    });

    return { imports, exports, definitions };
  }
}

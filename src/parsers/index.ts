/**
 * Parser factory and registry
 */

import { Language } from '../types/index.js';
import { Parser } from './base.js';
import { TypeScriptParserImpl } from './typescript.js';
import { HaskellParserImpl } from './haskell.js';
import { PureScriptParserImpl } from './purescript.js';

/**
 * Get the appropriate parser for a given language
 */
export function getParser(language: Language): Parser {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return new TypeScriptParserImpl();
    case 'haskell':
      return new HaskellParserImpl();
    case 'purescript':
      return new PureScriptParserImpl();
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

export type { Parser } from './base.js';
export { TypeScriptParserImpl } from './typescript.js';
export { HaskellParserImpl } from './haskell.js';
export { PureScriptParserImpl } from './purescript.js';

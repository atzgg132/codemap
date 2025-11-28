#!/usr/bin/env node
/**
 * Minimal stdio MCP-like server for CodeMap.
 * Protocol (line-delimited JSON):
 *  - {"id": "...", "method": "list_tools"}
 *    -> {"id": "...", "result": { tools: [ { name, description, inputSchema } ] } }
 *  - {"id": "...", "method": "call_tool", "tool": "codemap_analyze_repo", "params": {...}}
 *    -> {"id": "...", "result": <tool result>} or {"id": "...", "error": { message }}
 *
 * This is intentionally minimal to keep compatibility with external MCP loaders.
 */

import { resolve } from 'path';
import { z } from 'zod';
import { analyzeCodebase, generateSummary, type AnalysisContext } from '../agent.js';
import { getFileContext } from '../tools/getFileContext.js';

type RpcRequest =
  | { id: string; method: 'list_tools' }
  | { id: string; method: 'call_tool'; tool: string; params?: unknown };

type RpcResponse =
  | { id: string; result: unknown }
  | { id: string; error: { message: string } };

const tools = [
  {
    name: 'codemap_analyze_repo',
    description: 'Run CodeMap analysis on a repository and return markdown or JSON summary.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string', description: 'Path to the repository' },
        format: { type: 'string', enum: ['markdown', 'json'], default: 'markdown' },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'codemap_file_context',
    description: 'Get detailed context for a file (requires prior codemap_analyze_repo).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to a file in the analyzed repo' },
      },
      required: ['filePath'],
    },
  },
];

let lastContext: AnalysisContext | null = null;

async function handleRequest(req: RpcRequest): Promise<RpcResponse> {
  try {
    if (req.method === 'list_tools') {
      return { id: req.id, result: { tools } };
    } else if (req.method === 'call_tool') {
      if (req.tool === 'codemap_analyze_repo') {
        const schema = z.object({
          repoPath: z.string(),
          format: z.enum(['markdown', 'json']).default('markdown'),
        });
        const { repoPath, format } = schema.parse(req.params || {});
        const absolute = resolve(repoPath);
        const context = await analyzeCodebase(absolute);
        lastContext = context;
        const markdown = generateSummary(context);
        if (format === 'json') {
          return {
            id: req.id,
            result: {
              repoPath: context.repoPath,
              stats: {
                totalFiles: context.files?.length || 0,
                parsedFiles: context.parsedFiles?.length || 0,
                dependencies: context.graph?.edges.length || 0,
              },
              patterns: context.patterns,
              topFiles: context.rankedFiles?.slice(0, 20),
              entryPoints: context.entryPoints?.filter(ep => ep.type === 'entry').slice(0, 10),
              clusters: context.clusters,
              markdown,
            },
          };
        }
        return { id: req.id, result: { markdown } };
      }

      if (req.tool === 'codemap_file_context') {
        const schema = z.object({ filePath: z.string() });
        const { filePath } = schema.parse(req.params || {});
        if (!lastContext?.graph) {
          throw new Error('Run codemap_analyze_repo first to build analysis context.');
        }
        const result = await getFileContext({
          filePath: resolve(filePath),
          graph: lastContext.graph,
          clusters: lastContext.clusters,
          rankedFiles: lastContext.rankedFiles,
        });
        return { id: req.id, result };
      }

      throw new Error(`Unknown tool: ${req.tool}`);
    } else {
      throw new Error(`Unknown method: ${(req as any).method}`);
    }
  } catch (error) {
    return { id: req.id, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

// Line-delimited JSON over stdio
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (!isRpcRequest(obj)) {
        throw new Error('Invalid request');
      }
      handleRequest(obj).then(res => {
        process.stdout.write(JSON.stringify(res) + '\n');
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stdout.write(JSON.stringify({ id: 'unknown', error: { message: msg } }) + '\n');
    }
  }
});

function isRpcRequest(obj: any): obj is RpcRequest {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.id !== 'string') return false;
  if (obj.method === 'list_tools') return true;
  if (obj.method === 'call_tool' && typeof obj.tool === 'string') return true;
  return false;
}

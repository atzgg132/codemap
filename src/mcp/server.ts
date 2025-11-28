#!/usr/bin/env node
/**
 * CodeMap MCP server manifest (JSON to stdout).
 * This is a static MCPServerInfo that NeuroLink can ingest via addExternalMCPServer.
 *
 * Usage:
 *   node dist/mcp/server.js > codemap-mcp.json
 *   // In NeuroLink code:
 *   neurolink.addExternalMCPServer("codemap", JSON.parse(fs.readFileSync("codemap-mcp.json", "utf8")));
 */

import { resolve } from 'path';

const repoRoot = resolve('.');

const serverInfo = {
  id: 'codemap',
  name: 'CodeMap Analysis',
  description: 'CodeMap analysis tools (analyze repo, file context)',
  transport: 'stdio',
  status: 'connected',
  cwd: repoRoot,
  tools: [
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
  ],
};

console.log(JSON.stringify(serverInfo, null, 2));

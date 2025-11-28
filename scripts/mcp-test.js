#!/usr/bin/env node
/**
 * Quick helper to exercise the stdio MCP server.
 * Start the server in another terminal:
 *   node dist/mcp/stdioServer.js
 * Then run:
 *   node scripts/mcp-test.js --repo /path/to/repo
 */
import { createInterface } from 'readline';
import { stdin, stdout } from 'process';
import { argv } from 'node:process';

const args = Object.fromEntries(
  argv.slice(2).map((arg, idx, arr) => {
    if (arg.startsWith('--')) {
      return [arg.replace(/^--/, ''), arr[idx + 1]];
    }
    return [];
  }).filter(Boolean)
);

const repoPath = args.repo || '.';

const rl = createInterface({ input: stdin, output: stdout });
rl.on('line', line => {
  try {
    const obj = JSON.parse(line);
    console.log('response:', obj);
  } catch {
    console.log('raw:', line);
  }
});

function send(obj) {
  stdout.write(JSON.stringify(obj) + '\n');
}

// List tools
send({ id: '1', method: 'list_tools' });

// Run analysis
send({
  id: '2',
  method: 'call_tool',
  tool: 'codemap_analyze_repo',
  params: { repoPath, format: 'markdown' },
});

// After analysis, you can manually send a file_context call in the terminal once you see the response:
// {"id":"3","method":"call_tool","tool":"codemap_file_context","params":{"filePath":"/absolute/path/to/file"}}

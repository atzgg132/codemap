import assert from 'node:assert';
import { resolve } from 'path';
import { buildGraph } from '../src/graph/builder.js';
import { rankImportance } from '../src/tools/rankImportance.js';
import { findEntryPoints } from '../src/tools/findEntryPoints.js';
import { detectPatterns } from '../src/tools/detectPatterns.js';
import { createGraph } from '../src/graph/types.js';
import type { ParsedFile, Graph } from '../src/types/index.js';

const repoRoot = resolve('tests/fixtures/mini');

function miniParsedFiles(): ParsedFile[] {
  const p = (suffix: string) => resolve(repoRoot, suffix);
  return [
    {
      filePath: p('src/index.ts'),
      language: 'typescript',
      imports: [{ source: './api/routes', names: [], line: 1 }],
      exports: ['boot'],
      definitions: [{ name: 'boot', type: 'function', line: 3 }],
    },
    {
      filePath: p('src/api/routes.ts'),
      language: 'typescript',
      imports: [{ source: './service', names: [], line: 1 }],
      exports: ['route'],
      definitions: [{ name: 'route', type: 'function', line: 3 }],
    },
    {
      filePath: p('src/api/service.ts'),
      language: 'typescript',
      imports: [{ source: '../utils/log', names: [], line: 1 }],
      exports: ['service'],
      definitions: [{ name: 'service', type: 'function', line: 3 }],
    },
    {
      filePath: p('src/utils/log.ts'),
      language: 'typescript',
      imports: [],
      exports: ['log'],
      definitions: [{ name: 'log', type: 'function', line: 1 }],
    },
    {
      filePath: p('src/controllers/user.ts'),
      language: 'typescript',
      imports: [{ source: '../models/user', names: [], line: 1 }],
      exports: ['controller'],
      definitions: [{ name: 'controller', type: 'function', line: 3 }],
    },
    {
      filePath: p('src/models/user.ts'),
      language: 'typescript',
      imports: [],
      exports: ['user'],
      definitions: [{ name: 'user', type: 'variable', line: 1 }],
    },
    {
      filePath: p('src/views/userView.ts'),
      language: 'typescript',
      imports: [{ source: '../controllers/user', names: [], line: 1 }],
      exports: ['render'],
      definitions: [{ name: 'render', type: 'function', line: 3 }],
    },
  ];
}

function makeCycleGraph(): Graph {
  const g = createGraph();
  const a = '/tmp/repo/a.ts';
  const b = '/tmp/repo/b.ts';
  const dead = '/tmp/repo/dead.ts';
  g.nodes.set(a, { id: a, filePath: a, language: 'typescript' });
  g.nodes.set(b, { id: b, filePath: b, language: 'typescript' });
  g.nodes.set(dead, { id: dead, filePath: dead, language: 'typescript' });
  g.edges.push({ source: a, target: b, type: 'import' });
  g.edges.push({ source: b, target: a, type: 'import' });
  g.adjacencyList.set(a, [b]);
  g.adjacencyList.set(b, [a]);
  g.reverseAdjacencyList.set(a, [b]);
  g.reverseAdjacencyList.set(b, [a]);
  g.adjacencyList.set(dead, []);
  g.reverseAdjacencyList.set(dead, []);
  return g;
}

async function testGraphAndPagerank() {
  const parsed = miniParsedFiles();
  const graph = buildGraph(parsed, repoRoot);
  assert.strictEqual(graph.edges.length, 5);
  const rank = await rankImportance({ graph });
  const top = rank.rankedFiles[0].file;
  assert.ok(top.endsWith('log.ts'), 'log.ts should be highest due to inbound edges');
}

async function testEntryPoints() {
  const parsed = miniParsedFiles();
  const graph = buildGraph(parsed, repoRoot);
  const { entryPoints } = await findEntryPoints({ graph });
  const entries = entryPoints.filter(e => e.type === 'entry').map(e => e.file);
  const aggregators = entryPoints.filter(e => e.type === 'aggregator').map(e => e.file);
  assert.ok(entries.length > 0, 'should classify at least one entry');
  assert.ok(aggregators.some(f => f.endsWith('index.ts')), 'index.ts should be classified as aggregator or higher');
}

async function testPatterns() {
  const graph = makeCycleGraph();
  const files = [
    '/tmp/repo/src/controllers/user.ts',
    '/tmp/repo/src/models/user.ts',
    '/tmp/repo/src/views/user.tsx',
    '/tmp/repo/src/features/payments/index.ts',
    '/tmp/repo/test/user.test.ts',
    '/tmp/repo/src/index.ts',
  ];
  const { patterns } = await detectPatterns({
    graph,
    files,
    repoRoot: '/tmp/repo',
  });
  const names = patterns.map(p => p.pattern);
  assert.ok(names.includes('Circular Dependencies'), 'detects circular deps');
  assert.ok(names.includes('Unreferenced Files (Potential Dead Code)'), 'detects dead code');
  assert.ok(names.some(n => n.includes('MVC')), 'detects MVC');
  assert.ok(names.some(n => n.includes('Tests Present')), 'detects tests');
}

async function testCli() {
  const { execSync } = await import('node:child_process');
  const cmd = `npm run dev -- analyze ${repoRoot}`;
  const out = execSync(cmd, { encoding: 'utf-8' });
  assert.ok(out.includes('Analysis Complete'), 'CLI analysis should complete');
}

async function run() {
  await testGraphAndPagerank();
  await testEntryPoints();
  await testPatterns();
  await testCli();
  console.log('Analysis tests passed');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

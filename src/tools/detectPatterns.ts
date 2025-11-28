/**
 * detectPatterns Tool
 * Detects architectural patterns and conventions used in the codebase
 */

import { relative, dirname, basename } from 'path';
import { DetectPatternsInput, DetectPatternsOutput, Pattern, Graph } from '../types/index.js';
import { getInDegree, getOutDegree } from '../graph/types.js';

/**
 * Pattern detector function type
 */
type PatternDetector = (files: string[], repoRoot: string, graph: Graph) => Pattern | null;

/**
 * Detect MVC (Model-View-Controller) pattern
 */
const detectMVC: PatternDetector = (files, repoRoot) => {
  const relFiles = files.map(f => relative(repoRoot, f).toLowerCase());

  const hasModels = relFiles.some(f => f.includes('model'));
  const hasViews = relFiles.some(f => f.includes('view'));
  const hasControllers = relFiles.some(f => f.includes('controller'));

  if (hasModels && hasViews && hasControllers) {
    const evidence = [];
    if (hasModels) evidence.push('Found model files/directories');
    if (hasViews) evidence.push('Found view files/directories');
    if (hasControllers) evidence.push('Found controller files/directories');

    return {
      pattern: 'MVC (Model-View-Controller)',
      confidence: 0.9,
      evidence,
    };
  }

  return null;
};

/**
 * Detect Layered Architecture pattern
 */
const detectLayeredArch: PatternDetector = (files, repoRoot) => {
  const relFiles = files.map(f => relative(repoRoot, f).toLowerCase());

  const layers = {
    api: relFiles.some(f => f.includes('api') || f.includes('route')),
    service: relFiles.some(f => f.includes('service') || f.includes('business')),
    data: relFiles.some(f => f.includes('data') || f.includes('repository') || f.includes('dao')),
  };

  const layerCount = Object.values(layers).filter(Boolean).length;

  if (layerCount >= 2) {
    const evidence = [];
    if (layers.api) evidence.push('Found API/routing layer');
    if (layers.service) evidence.push('Found service/business logic layer');
    if (layers.data) evidence.push('Found data access layer');

    return {
      pattern: 'Layered Architecture',
      confidence: layerCount >= 3 ? 0.9 : 0.7,
      evidence,
    };
  }

  return null;
};

/**
 * Detect Feature-based organization
 */
const detectFeatureBased: PatternDetector = (files, repoRoot) => {
  const relFiles = files.map(f => relative(repoRoot, f));

  const hasFeatures = relFiles.some(f => f.includes('features/') || f.includes('modules/'));

  if (hasFeatures) {
    const featureDirs = new Set<string>();

    for (const file of relFiles) {
      if (file.includes('features/')) {
        const parts = file.split('features/')[1]?.split('/');
        if (parts && parts.length > 0) {
          featureDirs.add(parts[0]);
        }
      } else if (file.includes('modules/')) {
        const parts = file.split('modules/')[1]?.split('/');
        if (parts && parts.length > 0) {
          featureDirs.add(parts[0]);
        }
      }
    }

    if (featureDirs.size >= 2) {
      return {
        pattern: 'Feature-based Organization',
        confidence: 0.85,
        evidence: [
          `Found ${featureDirs.size} feature/module directories`,
          `Features: ${Array.from(featureDirs).slice(0, 5).join(', ')}${featureDirs.size > 5 ? '...' : ''}`,
        ],
      };
    }
  }

  return null;
};

/**
 * Detect Monorepo structure
 */
const detectMonorepo: PatternDetector = (files, repoRoot) => {
  const relFiles = files.map(f => relative(repoRoot, f));

  const hasPackages = relFiles.some(f => f.startsWith('packages/'));
  const hasApps = relFiles.some(f => f.startsWith('apps/'));

  if (hasPackages || hasApps) {
    const evidence = [];
    if (hasPackages) evidence.push('Found packages/ directory');
    if (hasApps) evidence.push('Found apps/ directory');

    return {
      pattern: 'Monorepo',
      confidence: (hasPackages && hasApps) ? 0.95 : 0.75,
      evidence,
    };
  }

  return null;
};

/**
 * Detect Barrel exports pattern (index files)
 */
const detectBarrelExports: PatternDetector = (files, repoRoot) => {
  const relFiles = files.map(f => relative(repoRoot, f));

  const indexFiles = relFiles.filter(f => {
    const name = f.split('/').pop();
    return name === 'index.ts' || name === 'index.js' || name === 'index.tsx' || name === 'index.jsx';
  });

  const ratio = indexFiles.length / files.length;

  if (indexFiles.length >= 5 && ratio > 0.05) {
    return {
      pattern: 'Barrel Exports',
      confidence: ratio > 0.15 ? 0.9 : 0.7,
      evidence: [
        `Found ${indexFiles.length} index files (${(ratio * 100).toFixed(1)}% of all files)`,
        'Index files used to re-export module contents',
      ],
    };
  }

  return null;
};

/**
 * Detect Domain-Driven Design patterns
 */
const detectDDD: PatternDetector = (files, repoRoot) => {
  const relFiles = files.map(f => relative(repoRoot, f).toLowerCase());

  const indicators = {
    entities: relFiles.some(f => f.includes('entit')),
    repositories: relFiles.some(f => f.includes('repositor')),
    services: relFiles.some(f => f.includes('service')),
    valueObjects: relFiles.some(f => f.includes('value') || f.includes('vo')),
    aggregates: relFiles.some(f => f.includes('aggregate')),
  };

  const indicatorCount = Object.values(indicators).filter(Boolean).length;

  if (indicatorCount >= 3) {
    const evidence = [];
    if (indicators.entities) evidence.push('Found entity files');
    if (indicators.repositories) evidence.push('Found repository pattern');
    if (indicators.services) evidence.push('Found domain services');
    if (indicators.valueObjects) evidence.push('Found value objects');
    if (indicators.aggregates) evidence.push('Found aggregates');

    return {
      pattern: 'Domain-Driven Design (DDD)',
      confidence: indicatorCount >= 4 ? 0.85 : 0.7,
      evidence,
    };
  }

  return null;
};

/**
 * All pattern detectors
 */
const detectCircularDependencies: PatternDetector = (_files, _repoRoot, graph) => {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  const adjacency = graph.adjacencyList;
  const nodes = Array.from(graph.nodes.keys());

  const dfs = (node: string, path: string[]) => {
    visited.add(node);
    stack.add(node);
    path.push(node);

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      if (stack.has(neighbor)) {
        const idx = path.indexOf(neighbor);
        if (idx >= 0) {
          cycles.push([...path.slice(idx), neighbor]);
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      }
    }

    stack.delete(node);
  };

  for (const node of nodes) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  if (cycles.length === 0) return null;

  const uniqueCycles = Array.from(new Set(cycles.map(c => c.join(' -> ')))).map(s => s.split(' -> '));
  const longest = uniqueCycles.reduce((max, c) => Math.max(max, c.length), 0);

  return {
    pattern: 'Circular Dependencies',
    confidence: Math.min(1, uniqueCycles.length / 5),
    evidence: [
      `Detected ${uniqueCycles.length} cycles (longest length: ${longest})`,
      ...uniqueCycles.slice(0, 3).map(c => `Cycle: ${c.join(' → ')}`),
    ],
  };
};

const detectDeadCode: PatternDetector = (_files, _repoRoot, graph) => {
  const unreferenced = Array.from(graph.nodes.keys()).filter(f => {
    const incoming = graph.reverseAdjacencyList.get(f);
    return !incoming || incoming.length === 0;
  });

  if (unreferenced.length === 0) return null;

  return {
    pattern: 'Unreferenced Files (Potential Dead Code)',
    confidence: Math.min(0.9, unreferenced.length / Math.max(3, graph.nodes.size)),
    evidence: [
      `Found ${unreferenced.length} files with no importers`,
      `Hotspots: ${unreferenced.slice(0, 3).map(f => f.split('/').pop()).join(', ')}...`,
    ],
  };
};

const detectTests: PatternDetector = (files, repoRoot) => {
  const rel = files.map(f => relative(repoRoot, f).toLowerCase());
  const testFiles = rel.filter(f => f.includes('test') || f.includes('__tests__'));
  if (testFiles.length === 0) return null;
  return {
    pattern: 'Tests Present',
    confidence: Math.min(1, testFiles.length / files.length + 0.2),
    evidence: [`Found ${testFiles.length} test files`, `Examples: ${testFiles.slice(0, 3).join(', ')}`],
  };
};

const detectConfigs: PatternDetector = (files, repoRoot) => {
  const rel = files.map(f => relative(repoRoot, f).toLowerCase());
  const configs = rel.filter(f =>
    f.match(/package\.json|tsconfig\.json|eslint|prettier|biome|\.env|vite\.config|webpack\.config|rollup\.config/)
  );
  if (configs.length === 0) return null;
  return {
    pattern: 'Config Heavy',
    confidence: Math.min(1, configs.length / files.length + 0.2),
    evidence: [`Found ${configs.length} config files`, `Examples: ${configs.slice(0, 3).join(', ')}`],
  };
};

const detectHotspots: PatternDetector = (_files, _repoRoot, graph) => {
  if (!graph || graph.nodes.size === 0) return null;
  const nodes = Array.from(graph.nodes.keys());
  const scored = nodes.map(f => {
    const indeg = getInDegree(graph, f);
    const outdeg = getOutDegree(graph, f);
    return { file: f, indeg, outdeg, total: indeg + outdeg };
  });
  scored.sort((a, b) => b.total - a.total);
  const top = scored.slice(0, 3);
  if (top.length === 0) return null;
  return {
    pattern: 'Graph Hotspots',
    confidence: Math.min(1, top[0].total / Math.max(1, graph.nodes.size)),
    evidence: top.map(t => `${basename(t.file)} (in:${t.indeg}, out:${t.outdeg})`),
  };
};

const PATTERN_DETECTORS: PatternDetector[] = [
  detectMVC,
  detectLayeredArch,
  detectFeatureBased,
  detectMonorepo,
  detectBarrelExports,
  detectDDD,
  detectCircularDependencies,
  detectDeadCode,
  detectTests,
  detectConfigs,
  detectHotspots,
];

/**
 * Detect architectural patterns in the codebase
 */
export async function detectPatterns(
  input: DetectPatternsInput
): Promise<DetectPatternsOutput> {
  const { graph, files, repoRoot } = input;

  if (!repoRoot) {
    throw new Error('repoRoot is required for pattern detection');
  }

  console.log(`Analyzing ${files.length} files for architectural patterns...`);

  const patterns: Pattern[] = [];

  // Run all pattern detectors
  for (const detector of PATTERN_DETECTORS) {
    const pattern = detector(files, repoRoot, graph);
    if (pattern) {
      patterns.push(pattern);
    }
  }

  // Sort by confidence
  patterns.sort((a, b) => b.confidence - a.confidence);

  if (patterns.length > 0) {
    console.log(`Detected ${patterns.length} architectural patterns:`);
    patterns.forEach(p => {
      console.log(`  - ${p.pattern} (confidence: ${(p.confidence * 100).toFixed(0)}%)`);
    });
  } else {
    console.log('No clear architectural patterns detected');
  }

  return { patterns };
}

/**
 * Tool metadata for NeuroLink agent
 */
export const detectPatternsTool = {
  name: 'detectPatterns',
  description: `Detects architectural patterns and conventions used in the codebase.

    Use this tool to:
    - Identify what architectural patterns are being used
    - Understand the overall structure and conventions
    - Get insights into the codebase's organization philosophy

    Detectable patterns:
    - MVC (Model-View-Controller)
    - Layered Architecture (API, Service, Data layers)
    - Feature-based Organization
    - Monorepo structure
    - Barrel Exports (index files pattern)
    - Domain-Driven Design (DDD)

    Input: { graph: Graph, files: string[], repoRoot: string }
    Output: { patterns: Pattern[] } - sorted by confidence

    Each pattern includes:
    - pattern: Name of the detected pattern
    - confidence: 0-1 score (how confident we are)
    - evidence: Array of evidence supporting this pattern`,
  fn: detectPatterns,
};

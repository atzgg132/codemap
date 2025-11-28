#!/usr/bin/env node
/**
 * CodeMap CLI
 * Main entry point for the CodeMap tool
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { writeFile } from 'fs/promises';
import { analyzeCodebase, generateSummary } from './agent.js';

const program = new Command();

program
  .name('codemap')
  .description('Agentic codebase analysis tool')
  .version('1.0.0');

program
  .command('analyze <repoPath>')
  .description('Analyze a codebase and generate insights')
  .option('-o, --output <file>', 'Output file for the analysis report (markdown)')
  .option('--json', 'Output results as JSON')
  .action(async (repoPath: string, options: { output?: string; json?: boolean }) => {
    try {
      const absolutePath = resolve(repoPath);

      console.log(`\n🔍 CodeMap - Analyzing ${absolutePath}\n`);

      // Run the analysis
      const context = await analyzeCodebase(absolutePath);

      // Generate output
      if (options.json) {
        // JSON output
        const jsonOutput = {
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
        };

        if (options.output) {
          await writeFile(options.output, JSON.stringify(jsonOutput, null, 2));
          console.log(`\n✅ Analysis saved to ${options.output}`);
        } else {
          console.log(JSON.stringify(jsonOutput, null, 2));
        }
      } else {
        // Markdown output
        const summary = generateSummary(context);

        if (options.output) {
          await writeFile(options.output, summary);
          console.log(`\n✅ Analysis saved to ${options.output}`);
        } else {
          console.log('\n' + summary);
        }
      }

      console.log('\n✨ Analysis complete!\n');
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('interactive <repoPath>')
  .description('Run CodeMap through the NeuroLink agent with tool calling')
  .option('-p, --prompt <prompt>', 'Custom prompt for the agent')
  .action(async (repoPath: string, options: { prompt?: string }) => {
    try {
      const absolutePath = resolve(repoPath);
      const { startNeurolinkChat } = await import('./neurolinkAgent.js');

      console.log(`\n🤖 NeuroLink + CodeMap - Chat mode for ${absolutePath}\n`);
      await startNeurolinkChat(absolutePath, options.prompt);
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

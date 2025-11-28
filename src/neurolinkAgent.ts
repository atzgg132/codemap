/**
 * NeuroLink integration for CodeMap
 * Registers CodeMap tools as NeuroLink custom tools so LLMs can orchestrate analyses.
 */

import { resolve } from 'path';
import readline from 'readline';
import { NeuroLink } from '@juspay/neurolink';
import chalk from 'chalk';
import { z } from 'zod';
import {
  analyzeCodebase,
  generateSummary,
  SYSTEM_PROMPT,
  type AnalysisContext,
} from './agent.js';
import { getFileContext } from './tools/getFileContext.js';

// Cache the most recent analysis so follow-up tools can reuse graph data
let lastContext: AnalysisContext | null = null;
const spinnerFrames = ['⠋', '⠙', '⠸', '⠴', '⠦', '⠇'];

/**
 * Create a NeuroLink instance with CodeMap tools registered.
 */
export async function createNeurolinkAgent(repoPath: string): Promise<NeuroLink> {
  const neurolink = new NeuroLink({
    enableOrchestration: true,
  });

  const defaultRepoPath = resolve(repoPath);
  const analyzeArgsSchema = z.object({
    repoPath: z.string().default(defaultRepoPath),
    output: z.enum(['markdown', 'json']).default('markdown'),
  });
  const fileContextArgsSchema = z.object({
    filePath: z.string(),
  });

  neurolink.registerTool('codemap_analyze_repo', {
    name: 'codemap_analyze_repo',
    description:
      'Run CodeMap analysis on a repository and return either markdown or JSON results.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: {
          type: 'string',
          description: 'Absolute or relative path to the repository to analyze',
          default: defaultRepoPath,
        },
        output: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Result format',
          default: 'markdown',
        },
      },
    },
    execute: async (params: unknown) => {
      const { repoPath: targetPath, output } = analyzeArgsSchema.parse(params || {});
      const repoToAnalyze = resolve(targetPath || defaultRepoPath);

      const context = await analyzeCodebase(repoToAnalyze);
      lastContext = context;

      const markdown = generateSummary(context);
      if (output === 'json') {
        return {
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
        };
      }

      return { markdown };
    },
  });

  neurolink.registerTool('codemap_file_context', {
    name: 'codemap_file_context',
    description:
      'Get detailed context for a file using the results of the most recent CodeMap analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file inside the analyzed repository',
        },
      },
      required: ['filePath'],
    },
    execute: async (params: unknown) => {
      const { filePath } = fileContextArgsSchema.parse(params || {});
      if (!lastContext?.graph) {
        throw new Error('Run codemap_analyze_repo first to build analysis context.');
      }

      return getFileContext({
        filePath: resolve(filePath),
        graph: lastContext.graph,
        clusters: lastContext.clusters,
        rankedFiles: lastContext.rankedFiles,
      });
    },
  });

  return neurolink;
}

/**
 * Run a single-shot NeuroLink generation using the registered CodeMap tools.
 */
export async function runNeurolinkAnalysis(
  repoPath: string,
  prompt?: string
): Promise<string> {
  const neurolink = await createNeurolinkAgent(repoPath);
  const inputPrompt =
    prompt ||
    `Analyze the repository at ${resolve(repoPath)} and produce a succinct onboarding guide. ` +
      'Call codemap_analyze_repo first, then share the findings.';

  const result = await neurolink.generate({
    input: { text: inputPrompt },
    systemPrompt: `${SYSTEM_PROMPT}\n\nYou have access to CodeMap tools via NeuroLink. Always call codemap_analyze_repo first for the target repository, then optionally use codemap_file_context for drill-down requests.`,
    disableTools: false,
  });

  return result.content;
}

/**
 * Start an interactive chat loop using NeuroLink + CodeMap tools.
 */
export async function startNeurolinkChat(
  repoPath: string,
  introPrompt?: string
): Promise<void> {
  const providerStatus = validateProviders();
  if (!providerStatus.ok && !process.env.NEUROLINK_ALLOW_NO_PROVIDER) {
    console.error(
      chalk.red(
        `No provider credentials detected. Set one of: ${providerStatus.expected.join(
          ', '
        )}. To bypass (tools may fail), set NEUROLINK_ALLOW_NO_PROVIDER=1.`
      )
    );
    process.exit(1);
  } else if (providerStatus.ok) {
    console.log(chalk.green(`Providers detected: ${providerStatus.found.join(', ')}`));
  } else {
    console.warn(
      chalk.yellow(
        'Continuing without provider validation (NEUROLINK_ALLOW_NO_PROVIDER set). Tool calls may fail.'
      )
    );
  }

  const neurolink = await createNeurolinkAgent(repoPath);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> ',
  });

  const conversationHistory: Array<{ role: string; content: string }> = [];

  const system = `${SYSTEM_PROMPT}\n\nYou have access to CodeMap tools via NeuroLink. Always call codemap_analyze_repo first for the target repository (${resolve(
    repoPath
  )}), then use codemap_file_context for follow-ups. Keep answers concise.`;

  const initial = introPrompt
    ? introPrompt
    : `Start by analyzing ${resolve(
        repoPath
      )} and share a short summary. Then wait for my follow-up questions.`;

  const hasCreds = checkProviderCredentials();
  if (!hasCreds) {
    console.warn(
      chalk.yellow(
        '⚠️  No recognized provider credentials found (e.g., OPENAI_API_KEY, ANTHROPIC_API_KEY). Tool calls may fail.'
      )
    );
  }

  printBanner(repoPath);
  printHelp();

  async function handle(message: string): Promise<void> {
    conversationHistory.push({ role: 'user', content: message });
    const stop = startSpinner('Thinking');
    try {
      const result = await neurolink.generate({
        input: { text: message },
        systemPrompt: system,
        conversationHistory,
        disableTools: false,
      });
      conversationHistory.push({ role: 'assistant', content: result.content });
      console.log(`\n${chalk.green('assistant>')} ${result.content}\n`);
    } catch (error) {
      const { title, hint } = formatFriendlyError(error);
      console.log(`\n${chalk.red('assistant>')} ${title}`);
      if (hint) {
        console.log(chalk.gray(`hint: ${hint}`));
      }
      console.log('');
    } finally {
      stop();
    }
  }

  console.log(chalk.gray('Type anything to chat. Commands: /help, /rerun, /exit\n'));
  await handle(initial);
  rl.prompt();

  rl.on('line', async line => {
    const trimmed = line.trim();
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit' || trimmed === '/exit') {
      rl.close();
      return;
    }
    if (trimmed === '/help') {
      printHelp();
      rl.prompt();
      return;
    }
    if (trimmed === '/rerun') {
      await handle(initial);
      rl.prompt();
      return;
    }
    if (trimmed.length === 0) {
      rl.prompt();
      return;
    }
    try {
      await handle(trimmed);
    } catch (error) {
      console.error(chalk.red('Error during chat turn:'), error);
    }
    rl.prompt();
  });

  rl.on('SIGINT', () => rl.close());
}

function checkProviderCredentials(): boolean {
  const keys = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'VERTEXAI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'MISTRAL_API_KEY',
  ];
  return keys.some(k => !!process.env[k]);
}

function validateProviders(): { ok: boolean; found: string[]; expected: string[] } {
  const expected = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'VERTEXAI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'MISTRAL_API_KEY',
  ];
  const found = expected.filter(k => !!process.env[k]);
  return { ok: found.length > 0, found: found.length ? found : ['none'], expected };
}

function formatFriendlyError(error: unknown): { title: string; hint?: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('API key') || message.toLowerCase().includes('unauthorized')) {
    return {
      title: 'Provider credentials are missing or invalid.',
      hint: 'Set OPENAI_API_KEY / ANTHROPIC_API_KEY (or your chosen provider) in the environment before running.',
    };
  }
  if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
    return {
      title: 'Network issue while calling the provider.',
      hint: 'Check internet connectivity or proxy/VPN settings and try again.',
    };
  }
  if (message.toLowerCase().includes('rate limit')) {
    return {
      title: 'Provider rate limit reached.',
      hint: 'Wait a bit or switch to another provider/model.',
    };
  }
  return { title: message };
}

function startSpinner(label: string): () => void {
  let i = 0;
  const interval = setInterval(() => {
    const frame = spinnerFrames[i % spinnerFrames.length];
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${chalk.cyan(frame)} ${chalk.gray(label)}...`);
    i += 1;
  }, 80);
  return () => {
    clearInterval(interval);
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  };
}

function printBanner(repoPath: string): void {
  const line = '═'.repeat(40);
  console.log(`\n${chalk.bold.magenta('🗺️  CodeMap x NeuroLink')}`);
  console.log(chalk.magenta(line));
  console.log(` ${chalk.blue('Repo:')} ${chalk.white(resolve(repoPath))}`);
  console.log(` ${chalk.blue('Mode:')} ${chalk.white('Chat with tools (codemap_analyze_repo, codemap_file_context)')}`);
  console.log(chalk.magenta(line) + '\n');
}

function printHelp(): void {
  console.log(chalk.bold('Commands:'));
  console.log(`  ${chalk.cyan('/help')}   Show this help`);
  console.log(`  ${chalk.cyan('/rerun')}  Re-run the initial analysis prompt`);
  console.log(`  ${chalk.cyan('/exit')}   Quit`);
  console.log('');
}

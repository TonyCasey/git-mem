#!/usr/bin/env node

import { Command } from 'commander';
import { rememberCommand } from './commands/remember';
import { recallCommand } from './commands/recall';
import { liberateCommand } from './commands/liberate';
import { syncCommand } from './commands/sync';
import { contextCommand } from './commands/context';
import { initCommand } from './commands/init';
import { hookCommand } from './commands/hook';
import { trailersCommand } from './commands/trailers';
import { createLogger } from './infrastructure/logging/factory';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../package.json') as { version: string };

const logger = createLogger().child({ component: 'cli' });
const program = new Command();

program
  .name('git-mem')
  .description('Git-native memory layer for AI coding tools')
  .version(pkg.version);

program
  .command('init')
  .description('Set up git-mem: hooks, MCP config, .gitignore, and liberate history')
  .option('-y, --yes', 'Accept defaults without prompting')
  .option('--commit-count <n>', 'Number of commits to liberate', '100')
  .option('--hooks', 'Install prepare-commit-msg git hook for AI-Agent trailers')
  .option('--uninstall-hooks', 'Remove the prepare-commit-msg git hook')
  .action((options) => initCommand(options, logger));

program
  .command('remember <text>')
  .description('Store a memory attached to the current commit')
  .option('-c, --commit <sha>', 'Attach to specific commit (default: HEAD)')
  .option('-t, --type <type>', 'Memory type: decision, gotcha, convention, fact', 'fact')
  .option('--confidence <level>', 'Confidence: verified, high, medium, low', 'high')
  .option('--lifecycle <tier>', 'Lifecycle: permanent, project, session', 'project')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--no-trailers', 'Skip writing AI-* trailers to the commit message')
  .action((text, options) => rememberCommand(text, options, logger));

program
  .command('recall [query]')
  .description('Search memories')
  .option('-n, --limit <n>', 'Max results', '10')
  .option('-t, --type <type>', 'Filter by type')
  .option('--since <date>', 'Filter by date')
  .option('--json', 'Output as JSON')
  .action((query, options) => recallCommand(query, options, logger));

program
  .command('liberate')
  .description('Liberate knowledge from existing commit history')
  .option('--since <date>', 'Start date (default: 90 days ago)')
  .option('--commit-count <n>', 'Max commits to process')
  .option('--dry-run', 'Preview without writing')
  .option('--threshold <n>', 'Interest score threshold', '3')
  .option('--enrich', 'Enable LLM enrichment (requires ANTHROPIC_API_KEY)')
  .action((options) => liberateCommand(options, logger));

program
  .command('context')
  .description('Show memories relevant to staged changes')
  .option('-n, --limit <n>', 'Max results', '10')
  .option('--threshold <n>', 'Min relevance score 0-1', '0.1')
  .option('--json', 'Output as JSON')
  .action((options) => contextCommand(options, logger));

program
  .command('sync')
  .description('Push/pull memory refs')
  .option('--push', 'Push only')
  .option('--pull', 'Pull only')
  .action((options) => syncCommand(options, logger));

program
  .command('trailers [sha]')
  .description('Inspect AI-* trailers on commits')
  .option('--query <key>', 'Search for trailer key across history (e.g. AI-Decision)')
  .option('--since <date>', 'Filter commits after date (YYYY-MM-DD)')
  .option('--keys', 'List all distinct AI-* trailer keys in the repo')
  .option('-n, --limit <n>', 'Max commits to search')
  .option('--json', 'Output as JSON')
  .action((sha, options) => trailersCommand(sha, options, logger));

program
  .command('hook <event>')
  .description('Handle Claude Code hook events (session-start, session-stop, prompt-submit)')
  .action((event) => hookCommand(event, logger));

program.parse(process.argv);

#!/usr/bin/env node

import { Command } from 'commander';
import { rememberCommand } from './commands/remember';
import { recallCommand } from './commands/recall';
import { liberateCommand } from './commands/liberate';
import { syncCommand } from './commands/sync';
import { contextCommand } from './commands/context';
import { initMcpCommand } from './commands/init-mcp';
import { createLogger } from './infrastructure/logging/factory';

const cliLogger = createLogger();
const program = new Command();

program
  .name('git-mem')
  .description('Git-native memory layer for AI coding tools')
  .version('0.1.0');

program
  .command('remember <text>')
  .description('Store a memory attached to the current commit')
  .option('-c, --commit <sha>', 'Attach to specific commit (default: HEAD)')
  .option('-t, --type <type>', 'Memory type: decision, gotcha, convention, fact', 'fact')
  .option('--confidence <level>', 'Confidence: verified, high, medium, low', 'high')
  .option('--lifecycle <tier>', 'Lifecycle: permanent, project, session', 'project')
  .option('--tags <tags>', 'Comma-separated tags')
  .action((text, options) => rememberCommand(text, options, cliLogger));

program
  .command('recall [query]')
  .description('Search memories')
  .option('-n, --limit <n>', 'Max results', '10')
  .option('-t, --type <type>', 'Filter by type')
  .option('--since <date>', 'Filter by date')
  .option('--json', 'Output as JSON')
  .action((query, options) => recallCommand(query, options, cliLogger));

program
  .command('liberate')
  .description('Liberate knowledge from existing commit history')
  .option('--since <date>', 'Start date (default: 90 days ago)')
  .option('--max <n>', 'Max commits to process')
  .option('--dry-run', 'Preview without writing')
  .option('--threshold <n>', 'Interest score threshold', '3')
  .option('--enrich', 'Enable LLM enrichment (requires ANTHROPIC_API_KEY)')
  .action((options) => liberateCommand(options, cliLogger));

program
  .command('context')
  .description('Show memories relevant to staged changes')
  .option('-n, --limit <n>', 'Max results', '10')
  .option('--threshold <n>', 'Min relevance score 0-1', '0.1')
  .option('--json', 'Output as JSON')
  .action((options) => contextCommand(options, cliLogger));

program
  .command('sync')
  .description('Push/pull memory refs')
  .option('--push', 'Push only')
  .option('--pull', 'Pull only')
  .action((options) => syncCommand(options, cliLogger));

program
  .command('init-mcp')
  .description('Generate .mcp.json for AI coding tools')
  .option('--force', 'Overwrite existing .mcp.json')
  .option('--global', 'Use globally installed git-mem-mcp binary')
  .action((options) => initMcpCommand(options, cliLogger));

program.parse(process.argv);

#!/usr/bin/env node

import { Command } from 'commander';
import { rememberCommand } from './commands/remember';
import { recallCommand } from './commands/recall';
import { retrofitCommand } from './commands/retrofit';
import { syncCommand } from './commands/sync';

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
  .action(rememberCommand);

program
  .command('recall [query]')
  .description('Search memories')
  .option('-n, --limit <n>', 'Max results', '10')
  .option('-t, --type <type>', 'Filter by type')
  .option('--since <date>', 'Filter by date')
  .option('--json', 'Output as JSON')
  .action(recallCommand);

program
  .command('retrofit')
  .description('Annotate existing commit history with AI metadata')
  .option('--since <date>', 'Start date (default: 90 days ago)')
  .option('--max <n>', 'Max commits to process')
  .option('--dry-run', 'Preview without writing')
  .option('--threshold <n>', 'Interest score threshold', '3')
  .action(retrofitCommand);

program
  .command('sync')
  .description('Push/pull memory refs')
  .option('--push', 'Push only')
  .option('--pull', 'Pull only')
  .action(syncCommand);

program.parse(process.argv);

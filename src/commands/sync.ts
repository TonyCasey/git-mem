/**
 * sync command handler
 *
 * Push/pull memory notes refs to/from remote.
 */

import { execFileSync } from 'child_process';
import { DEFAULT_NOTES_REF } from '../domain/interfaces/INotesService';
import type { ILogger } from '../domain/interfaces/ILogger';

interface ISyncOptions {
  push?: boolean;
  pull?: boolean;
}

export async function syncCommand(options: ISyncOptions, logger?: ILogger): Promise<void> {
  const log = logger?.child({ command: 'sync' });
  log?.info('Command invoked', { push: options.push, pull: options.pull });
  const pushOnly = options.push && !options.pull;
  const pullOnly = options.pull && !options.push;
  const both = !options.push && !options.pull;

  if (pullOnly || both) {
    console.log(`Pulling ${DEFAULT_NOTES_REF}...`);
    try {
      execFileSync('git', ['fetch', 'origin', `${DEFAULT_NOTES_REF}:${DEFAULT_NOTES_REF}`], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log('  Pull complete.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('no such ref') || message.includes("couldn't find remote ref")) {
        console.log('  No remote notes found (first sync?).');
      } else if (message.includes('does not appear to be a git repository') || message.includes('No configured push destination')) {
        console.log('  No remote configured. Add a remote with: git remote add origin <url>');
      } else {
        console.error(`  Pull failed: ${message}`);
      }
    }
  }

  if (pushOnly || both) {
    console.log(`Pushing ${DEFAULT_NOTES_REF}...`);
    try {
      execFileSync('git', ['push', 'origin', DEFAULT_NOTES_REF], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log('  Push complete.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not match any')) {
        console.log('  No local notes to push.');
      } else if (message.includes('does not appear to be a git repository') || message.includes('No configured push destination')) {
        console.log('  No remote configured. Add a remote with: git remote add origin <url>');
      } else {
        console.error(`  Push failed: ${message}`);
      }
    }
  }
}

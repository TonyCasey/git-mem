/**
 * context command handler
 */

import { createContainer } from '../infrastructure/di';
import type { ILogger } from '../domain/interfaces/ILogger';

interface IContextCommandOptions {
  limit?: string;
  threshold?: string;
  json?: boolean;
}

export async function contextCommand(options: IContextCommandOptions, logger?: ILogger): Promise<void> {
  const container = createContainer({ logger, scope: 'context' });
  const { contextService, logger: log } = container.cradle;
  log.info('Command invoked');

  const result = contextService.getContext({
    limit: options.limit ? parseInt(options.limit, 10) : 10,
    threshold: options.threshold ? parseFloat(options.threshold) : 0.1,
  });

  if (result.files.length === 0) {
    console.log('No staged changes. Stage files with `git add` first.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Staged files: ${result.files.join(', ')}`);
  console.log(`Scanned ${result.totalScanned} memories\n`);

  if (result.memories.length === 0) {
    console.log('No relevant memories found.');
    return;
  }

  console.log(`${result.memories.length} relevant memor${result.memories.length === 1 ? 'y' : 'ies'}:\n`);

  for (const scored of result.memories) {
    const pct = Math.round(scored.score * 100);
    console.log(`  [${scored.memory.type}] ${scored.memory.content}  (${pct}%)`);
    console.log(`    ${scored.reason}`);
    if (scored.memory.tags.length > 0) {
      console.log(`    tags: ${scored.memory.tags.join(', ')}`);
    }
    console.log();
  }
}

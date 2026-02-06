/**
 * recall command handler
 */

import { MemoryService } from '../application/services/MemoryService';
import { MemoryRepository } from '../infrastructure/repositories/MemoryRepository';
import { NotesService } from '../infrastructure/services/NotesService';
import type { ILogger } from '../domain/interfaces/ILogger';
import type { MemoryType } from '../domain/entities/IMemoryEntity';

interface IRecallOptions {
  limit?: string;
  type?: string;
  since?: string;
  json?: boolean;
}

export async function recallCommand(query: string | undefined, options: IRecallOptions, logger: ILogger): Promise<void> {
  const log = logger.child({ command: 'recall' });
  log.info('Starting recall', { query, type: options.type, limit: options.limit });

  const notesService = new NotesService();
  const memoryRepo = new MemoryRepository(notesService);
  const memoryService = new MemoryService(memoryRepo, log);

  const result = memoryService.recall(query, {
    limit: options.limit ? parseInt(options.limit, 10) : 10,
    type: options.type as MemoryType | undefined,
    since: options.since,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.memories.length === 0) {
    console.log('No memories found.');
    return;
  }

  console.log(`Found ${result.total} memor${result.total === 1 ? 'y' : 'ies'}:\n`);

  for (const memory of result.memories) {
    console.log(`  [${memory.type}] ${memory.content}`);
    console.log(`    id: ${memory.id}  sha: ${memory.sha.slice(0, 7)}  confidence: ${memory.confidence}`);
    if (memory.tags.length > 0) {
      console.log(`    tags: ${memory.tags.join(', ')}`);
    }
    console.log();
  }

  log.info('Recall complete', { total: result.total, returned: result.memories.length });
}

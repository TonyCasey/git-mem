/**
 * MemoryContextLoader
 *
 * Loads and filters memories for hook context injection.
 * Delegates to IMemoryRepository for actual data access.
 */

import type { IMemoryContextLoader, IMemoryContextOptions, IMemoryContextResult } from '../../domain/interfaces/IMemoryContextLoader';
import type { IMemoryRepository } from '../../domain/interfaces/IMemoryRepository';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class MemoryContextLoader implements IMemoryContextLoader {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly logger?: ILogger,
  ) {}

  load(options?: IMemoryContextOptions): IMemoryContextResult {
    if (options?.tags && options.tags.length > 1) {
      this.logger?.warn('Multiple tags provided; only the first tag is supported', {
        tags: options.tags,
      });
    }

    // First get total count (no filters)
    const allResult = this.memoryRepository.query({ cwd: options?.cwd });
    const total = allResult.total;

    // Now query with filters
    const result = this.memoryRepository.query({
      limit: options?.limit,
      since: options?.since,
      tag: options?.tags?.[0], // IMemoryQueryOptions supports single tag
      cwd: options?.cwd,
    });

    this.logger?.debug('Memories loaded for context', {
      total,
      filtered: result.memories.length,
      limit: options?.limit,
    });

    return {
      memories: result.memories as readonly import('../../domain/entities/IMemoryEntity').IMemoryEntity[],
      total,
      filtered: result.memories.length,
    };
  }
}

/**
 * MemoryContextLoader
 *
 * Loads and filters memories for hook context injection.
 * Delegates to IMemoryRepository for general loads and
 * IMemoryService for query-based searches (notes + trailers).
 */

import type { IMemoryContextLoader, IMemoryContextOptions, IMemoryContextResult } from '../../domain/interfaces/IMemoryContextLoader';
import type { IMemoryRepository } from '../../domain/interfaces/IMemoryRepository';
import type { IMemoryService } from '../interfaces/IMemoryService';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class MemoryContextLoader implements IMemoryContextLoader {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly logger?: ILogger,
    private readonly memoryService?: IMemoryService,
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

  loadWithQuery(query: string, limit?: number, cwd?: string): IMemoryContextResult {
    // Use MemoryService.recall() to search both notes and trailers
    if (!this.memoryService) {
      this.logger?.warn('MemoryService not available for query search, falling back to repository');
      return this.load({ limit, cwd });
    }

    // Get total count for stats
    const allResult = this.memoryRepository.query({ cwd });
    const total = allResult.total;

    // Search with query
    const result = this.memoryService.recall(query, { limit, cwd });

    this.logger?.debug('Memories loaded with query', {
      query,
      total,
      matched: result.memories.length,
      limit,
    });

    return {
      memories: result.memories,
      total,
      filtered: result.memories.length,
    };
  }
}

/**
 * MemoryContextLoader
 *
 * Loads and filters memories for hook context injection.
 * Delegates to IMemoryRepository for general loads and
 * IMemoryService for query-based searches (notes + trailers).
 * Optionally fetches commit messages for loaded memories.
 */

import type { IMemoryContextLoader, IMemoryContextOptions, IMemoryContextResult, ICommitMessage } from '../../domain/interfaces/IMemoryContextLoader';
import type { IMemoryRepository } from '../../domain/interfaces/IMemoryRepository';
import type { IMemoryService } from '../interfaces/IMemoryService';
import type { IGitClient } from '../../domain/interfaces/IGitClient';
import type { ILogger } from '../../domain/interfaces/ILogger';
import type { IMemoryEntity } from '../../domain/entities/IMemoryEntity';

export class MemoryContextLoader implements IMemoryContextLoader {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly logger?: ILogger,
    private readonly memoryService?: IMemoryService,
    private readonly gitClient?: IGitClient,
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

    const memories = result.memories as readonly IMemoryEntity[];

    // Fetch commit messages if requested
    let commitMessages: ReadonlyMap<string, ICommitMessage> | undefined;
    if (options?.includeCommitMessages && this.gitClient && memories.length > 0) {
      commitMessages = this.fetchCommitMessages(memories, options.cwd);
    }

    this.logger?.debug('Memories loaded for context', {
      total,
      filtered: memories.length,
      limit: options?.limit,
      hasCommitMessages: !!commitMessages,
    });

    return {
      memories,
      total,
      filtered: memories.length,
      commitMessages,
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

  /**
   * Fetch commit messages for all memories in a single batch call.
   */
  private fetchCommitMessages(
    memories: readonly IMemoryEntity[],
    cwd?: string,
  ): ReadonlyMap<string, ICommitMessage> {
    // Collect unique SHAs from memories
    const shas = [...new Set(memories.map(m => m.sha).filter(Boolean))];

    if (shas.length === 0 || !this.gitClient) {
      return new Map();
    }

    try {
      const messages = this.gitClient.getCommitMessages(shas, cwd);
      this.logger?.debug('Fetched commit messages', { count: messages.size });
      return messages;
    } catch (error) {
      this.logger?.warn('Failed to fetch commit messages', {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map();
    }
  }
}

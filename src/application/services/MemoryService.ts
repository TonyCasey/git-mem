/**
 * MemoryService
 *
 * Application service that orchestrates memory operations.
 * Dual-writes to git notes (rich JSON) and commit trailers
 * (lightweight, natively queryable metadata).
 */

import type { IMemoryService } from '../interfaces/IMemoryService';
import type { IMemoryRepository, IMemoryQueryOptions, IMemoryQueryResult } from '../../domain/interfaces/IMemoryRepository';
import type { IMemoryEntity, ICreateMemoryOptions, MemoryType } from '../../domain/entities/IMemoryEntity';
import type { ITrailerService } from '../../domain/interfaces/ITrailerService';
import type { ITrailer } from '../../domain/entities/ITrailer';
import { AI_TRAILER_KEYS } from '../../domain/entities/ITrailer';
import type { ILogger } from '../../domain/interfaces/ILogger';

const MEMORY_TYPE_TO_TRAILER_KEY: Record<MemoryType, string> = {
  decision: AI_TRAILER_KEYS.DECISION,
  gotcha: AI_TRAILER_KEYS.GOTCHA,
  convention: AI_TRAILER_KEYS.CONVENTION,
  fact: AI_TRAILER_KEYS.FACT,
};

export class MemoryService implements IMemoryService {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly logger?: ILogger,
    private readonly trailerService?: ITrailerService,
  ) {}

  remember(text: string, options?: ICreateMemoryOptions): IMemoryEntity {
    const memory = this.memoryRepository.create(text, options);
    this.logger?.info('Memory stored', { id: memory.id, type: memory.type, sha: memory.sha });

    // Dual-write: also add AI-* trailers to the commit (opt-out via trailers: false)
    if (options?.trailers !== false && this.trailerService) {
      try {
        const trailers = this.buildTrailers(memory);
        this.trailerService.addTrailers(trailers, options?.cwd);
        this.logger?.info('Trailers written', { count: trailers.length, sha: memory.sha });
      } catch (err) {
        // Trailer write failure is non-fatal (commit may be pushed already)
        this.logger?.warn('Trailer write failed', {
          error: err instanceof Error ? err.message : String(err),
          sha: memory.sha,
        });
      }
    }

    return memory;
  }

  private buildTrailers(memory: IMemoryEntity): ITrailer[] {
    const trailers: ITrailer[] = [
      { key: MEMORY_TYPE_TO_TRAILER_KEY[memory.type], value: memory.content },
      { key: AI_TRAILER_KEYS.CONFIDENCE, value: memory.confidence },
      { key: AI_TRAILER_KEYS.MEMORY_ID, value: memory.id },
    ];

    if (memory.tags.length > 0) {
      trailers.push({ key: AI_TRAILER_KEYS.TAGS, value: memory.tags.join(', ') });
    }

    return trailers;
  }

  recall(query?: string, options?: IMemoryQueryOptions): IMemoryQueryResult {
    const effectiveQuery = query ?? options?.query;
    const result = this.memoryRepository.query({
      ...options,
      query: effectiveQuery,
    });
    this.logger?.info('Memory recall', { query: effectiveQuery, count: result.memories.length, total: result.total });
    return result;
  }

  get(id: string, cwd?: string): IMemoryEntity | null {
    return this.memoryRepository.getById(id, cwd);
  }

  delete(id: string, cwd?: string): boolean {
    const deleted = this.memoryRepository.delete(id, cwd);
    this.logger?.info('Memory deleted', { id, deleted });
    return deleted;
  }
}

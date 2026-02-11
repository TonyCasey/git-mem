/**
 * MemoryService
 *
 * Application service that orchestrates memory operations.
 * Delegates storage to IMemoryRepository.
 */

import type { IMemoryService } from '../interfaces/IMemoryService';
import type { IMemoryRepository, IMemoryQueryOptions, IMemoryQueryResult } from '../../domain/interfaces/IMemoryRepository';
import type { IMemoryEntity, ICreateMemoryOptions } from '../../domain/entities/IMemoryEntity';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class MemoryService implements IMemoryService {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly logger?: ILogger,
  ) {}

  remember(text: string, options?: ICreateMemoryOptions): IMemoryEntity {
    const memory = this.memoryRepository.create(text, options);
    this.logger?.info('Memory stored', { id: memory.id, type: memory.type, sha: memory.sha });
    return memory;
  }

  recall(query?: string, options?: IMemoryQueryOptions): IMemoryQueryResult {
    const result = this.memoryRepository.query({
      ...options,
      query: query || options?.query,
    });
    this.logger?.info('Memory recall', { query, count: result.memories.length, total: result.total });
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

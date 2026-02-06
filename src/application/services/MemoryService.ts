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
    private readonly logger?: ILogger
  ) {}

  remember(text: string, options?: ICreateMemoryOptions): IMemoryEntity {
    this.logger?.debug('Storing memory', { type: options?.type, sha: options?.sha });
    const memory = this.memoryRepository.create(text, options);
    this.logger?.info('Memory stored', { id: memory.id, type: memory.type, sha: memory.sha });
    return memory;
  }

  recall(query?: string, options?: IMemoryQueryOptions): IMemoryQueryResult {
    this.logger?.debug('Recalling memories', { query, type: options?.type, limit: options?.limit });
    const result = this.memoryRepository.query({
      ...options,
      query: query || options?.query,
    });
    this.logger?.info('Recall complete', { total: result.total, returned: result.memories.length });
    return result;
  }

  get(id: string, cwd?: string): IMemoryEntity | null {
    this.logger?.debug('Getting memory by id', { id });
    return this.memoryRepository.getById(id, cwd);
  }

  delete(id: string, cwd?: string): boolean {
    this.logger?.debug('Deleting memory', { id });
    const deleted = this.memoryRepository.delete(id, cwd);
    if (deleted) {
      this.logger?.info('Memory deleted', { id });
    } else {
      this.logger?.warn('Memory not found for deletion', { id });
    }
    return deleted;
  }
}

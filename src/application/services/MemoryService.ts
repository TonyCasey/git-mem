/**
 * MemoryService
 *
 * Application service that orchestrates memory operations.
 * Delegates storage to IMemoryRepository.
 */

import type { IMemoryService } from '../interfaces/IMemoryService';
import type { IMemoryRepository, IMemoryQueryOptions, IMemoryQueryResult } from '../../domain/interfaces/IMemoryRepository';
import type { IMemoryEntity, ICreateMemoryOptions } from '../../domain/entities/IMemoryEntity';

export class MemoryService implements IMemoryService {
  constructor(
    private readonly memoryRepository: IMemoryRepository
  ) {}

  remember(text: string, options?: ICreateMemoryOptions): IMemoryEntity {
    return this.memoryRepository.create(text, options);
  }

  recall(query?: string, options?: IMemoryQueryOptions): IMemoryQueryResult {
    return this.memoryRepository.query({
      ...options,
      query: query || options?.query,
    });
  }

  get(id: string, cwd?: string): IMemoryEntity | null {
    return this.memoryRepository.getById(id, cwd);
  }

  delete(id: string, cwd?: string): boolean {
    return this.memoryRepository.delete(id, cwd);
  }
}

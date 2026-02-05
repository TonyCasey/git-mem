/**
 * IMemoryService
 *
 * Application service interface for memory operations.
 * Orchestrates trailers + notes for remember/recall.
 */

import type { IMemoryEntity, ICreateMemoryOptions } from '../../domain/entities/IMemoryEntity';
import type { IMemoryQueryOptions, IMemoryQueryResult } from '../../domain/interfaces/IMemoryRepository';

/**
 * Memory service interface.
 */
export interface IMemoryService {
  /**
   * Store a new memory attached to a commit.
   * @param text - Memory content text.
   * @param options - Creation options (type, tags, sha, etc.).
   * @returns The created memory entity.
   */
  remember(text: string, options?: ICreateMemoryOptions): IMemoryEntity;

  /**
   * Search memories.
   * @param query - Free-text search query.
   * @param options - Query options.
   * @returns Query result with matching memories.
   */
  recall(query?: string, options?: IMemoryQueryOptions): IMemoryQueryResult;

  /**
   * Get a single memory by UUID.
   * @param id - Memory UUID.
   * @param cwd - Working directory.
   * @returns The memory entity, or null if not found.
   */
  get(id: string, cwd?: string): IMemoryEntity | null;

  /**
   * Delete a memory by UUID.
   * @param id - Memory UUID.
   * @param cwd - Working directory.
   * @returns True if deleted, false if not found.
   */
  delete(id: string, cwd?: string): boolean;
}

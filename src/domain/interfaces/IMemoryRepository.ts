/**
 * IMemoryRepository
 *
 * Domain interface for memory CRUD operations.
 * Backed by git notes in the infrastructure layer.
 */

import { IMemoryEntity, ICreateMemoryOptions, MemoryType } from '../entities/IMemoryEntity';

/**
 * Options for querying memories.
 */
export interface IMemoryQueryOptions {
  /** Free-text search query. */
  readonly query?: string;
  /** Filter by memory type. */
  readonly type?: MemoryType;
  /** Filter by tag. */
  readonly tag?: string;
  /** Filter memories created after this date. */
  readonly since?: string;
  /** Maximum number of results. */
  readonly limit?: number;
  /** Working directory. */
  readonly cwd?: string;
}

/**
 * Result of a memory query.
 */
export interface IMemoryQueryResult {
  /** Matching memories. */
  readonly memories: readonly IMemoryEntity[];
  /** Total count of matches (may exceed limit). */
  readonly total: number;
}

/**
 * Memory repository interface.
 *
 * Provides CRUD operations for memories backed by git notes.
 */
export interface IMemoryRepository {
  /**
   * Create a new memory.
   * @param content - Memory text content.
   * @param options - Creation options (type, tags, sha, etc.).
   * @returns The created memory entity.
   */
  create(content: string, options?: ICreateMemoryOptions): IMemoryEntity;

  /**
   * Get a memory by its UUID.
   * @param id - Memory UUID.
   * @param cwd - Working directory.
   * @returns The memory entity, or null if not found.
   */
  getById(id: string, cwd?: string): IMemoryEntity | null;

  /**
   * Query memories with optional filters.
   * @param options - Query options.
   * @returns Query result with matching memories.
   */
  query(options?: IMemoryQueryOptions): IMemoryQueryResult;

  /**
   * Delete a memory by its UUID.
   * @param id - Memory UUID.
   * @param cwd - Working directory.
   * @returns True if deleted, false if not found.
   */
  delete(id: string, cwd?: string): boolean;
}

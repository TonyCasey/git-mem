/**
 * IContextService
 *
 * Application service interface for retrieving memories
 * relevant to the current staged changes.
 */

import type { IMemoryEntity } from '../../domain/entities/IMemoryEntity';

/**
 * A memory scored for relevance to the current context.
 */
export interface IScoredMemory {
  /** The memory entity. */
  readonly memory: IMemoryEntity;
  /** Relevance score (0–1). Higher = more relevant. */
  readonly score: number;
  /** Why this memory matched (e.g. matched keywords/tags). */
  readonly reason: string;
}

/**
 * Options for context retrieval.
 */
export interface IContextOptions {
  /** Maximum number of results (default: 10). */
  readonly limit?: number;
  /** Minimum relevance score threshold (0–1, default: 0.1). */
  readonly threshold?: number;
  /** Working directory. */
  readonly cwd?: string;
}

/**
 * Result of a context query.
 */
export interface IContextResult {
  /** Staged files that were analyzed. */
  readonly files: readonly string[];
  /** Relevant memories sorted by score descending. */
  readonly memories: readonly IScoredMemory[];
  /** Total memories scanned. */
  readonly totalScanned: number;
}

/**
 * Context service interface.
 */
export interface IContextService {
  /**
   * Get memories relevant to the currently staged changes.
   * @param options - Context options.
   * @returns Context result with scored memories.
   */
  getContext(options?: IContextOptions): IContextResult;
}

/**
 * IMemoryContextLoader
 *
 * Domain interface for loading and filtering memories
 * for hook context injection into Claude Code.
 */

import type { IMemoryEntity } from '../entities/IMemoryEntity';

export interface IMemoryContextOptions {
  /** Maximum number of memories to return. */
  readonly limit?: number;
  /** Filter memories created after this date (ISO 8601). */
  readonly since?: string;
  /** Filter by tags. */
  readonly tags?: string[];
  /** Working directory for git operations. */
  readonly cwd?: string;
}

export interface IMemoryContextResult {
  /** Matching memories. */
  readonly memories: readonly IMemoryEntity[];
  /** Total memories in store (before filtering). */
  readonly total: number;
  /** Number returned after filtering. */
  readonly filtered: number;
}

export interface IMemoryContextLoader {
  /** Load memories with optional filters. */
  load(options?: IMemoryContextOptions): IMemoryContextResult;
}

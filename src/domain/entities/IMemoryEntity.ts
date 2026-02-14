/**
 * IMemoryEntity
 *
 * Core entity representing a single memory fact stored in git.
 * A memory is always associated with a specific git object (commit SHA).
 */

import { ConfidenceLevel, SourceType } from '../types/IMemoryQuality';
import { MemoryLifecycle } from '../types/IMemoryLifecycle';

/**
 * Memory type classification.
 */
export type MemoryType = 'decision' | 'gotcha' | 'convention' | 'fact';

/**
 * All valid memory types.
 */
export const MEMORY_TYPE_VALUES: readonly MemoryType[] = [
  'decision',
  'gotcha',
  'convention',
  'fact',
] as const;

/**
 * A single memory entity stored as a git note.
 */
export interface IMemoryEntity {
  /** Unique identifier (UUID v4). */
  readonly id: string;
  /** The memory content text. */
  readonly content: string;
  /** Memory type classification. */
  readonly type: MemoryType;
  /** Git object SHA this memory is attached to. */
  readonly sha: string;
  /** Confidence level. */
  readonly confidence: ConfidenceLevel;
  /** Source of this memory. */
  readonly source: SourceType;
  /** Lifecycle tier controlling retention. */
  readonly lifecycle: MemoryLifecycle;
  /** User-supplied tags. */
  readonly tags: readonly string[];
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  readonly updatedAt: string;
  /** Optional expiration timestamp. */
  readonly expiresAt?: string;
}

/**
 * Options for creating a new memory.
 */
export interface ICreateMemoryOptions {
  /** Attach to specific commit SHA (default: HEAD). */
  readonly sha?: string;
  /** Memory type (default: 'fact'). */
  readonly type?: MemoryType;
  /** Confidence level (default: 'high'). */
  readonly confidence?: ConfidenceLevel;
  /** Lifecycle tier (default: 'project'). */
  readonly lifecycle?: MemoryLifecycle;
  /** Comma-separated or array of tags. */
  readonly tags?: string | readonly string[];
  /** Source type (default: 'user-explicit'). */
  readonly source?: SourceType;
  /** Working directory. */
  readonly cwd?: string;
  /** Write AI-* trailers to the commit message (default: true). */
  readonly trailers?: boolean;
  /** AI agent name (e.g. 'Claude-Code'). */
  readonly agent?: string;
  /** AI model identifier (e.g. 'claude-opus-4-6'). */
  readonly model?: string;
}

/**
 * Check if a string is a valid MemoryType value.
 */
export function isValidMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPE_VALUES.includes(value as MemoryType);
}

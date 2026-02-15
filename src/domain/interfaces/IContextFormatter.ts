/**
 * IContextFormatter
 *
 * Domain interface for formatting memories as markdown
 * for Claude Code's context window.
 */

import type { IMemoryEntity } from '../entities/IMemoryEntity';
import type { ICommitMessage } from './IMemoryContextLoader';

export interface IFormatOptions {
  /** How the session was triggered (e.g., 'startup', 'resume'). */
  readonly trigger?: string;
  /** Include memory count and stats in the output. */
  readonly includeStats?: boolean;
  /** Maximum output length in characters. */
  readonly maxLength?: number;
  /** Commit messages keyed by SHA, to include with memories. */
  readonly commitMessages?: ReadonlyMap<string, ICommitMessage>;
}

export interface IContextFormatter {
  /** Format memories as markdown for Claude context. */
  format(memories: readonly IMemoryEntity[], options?: IFormatOptions): string;
}

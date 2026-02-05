/**
 * ITrailerService
 *
 * Domain interface for reading and writing AI-* commit trailers.
 * Trailers are key-value metadata appended to git commit messages,
 * queryable via `git log --format='%(trailers)'`.
 */

import { ITrailer } from '../entities/ITrailer';

/**
 * Options for querying trailers across history.
 */
export interface ITrailerQueryOptions {
  /** Only show trailers after this date (YYYY-MM-DD). */
  readonly since?: string;
  /** Maximum number of commits to search. */
  readonly maxCount?: number;
  /** Working directory. */
  readonly cwd?: string;
}

/**
 * A commit with its associated AI-* trailers.
 */
export interface ICommitTrailers {
  /** Commit SHA. */
  readonly sha: string;
  /** Parsed AI-* trailers from this commit. */
  readonly trailers: readonly ITrailer[];
}

/**
 * Trailer service interface.
 *
 * Reads and writes AI-* commit trailers via git CLI.
 */
export interface ITrailerService {
  /**
   * Read all AI-* trailers from a specific commit.
   * @param sha - Commit SHA (default: HEAD).
   * @param cwd - Working directory.
   * @returns Array of parsed trailers.
   */
  readTrailers(sha?: string, cwd?: string): ITrailer[];

  /**
   * Format trailers for appending to a commit message.
   * @param trailers - Trailers to format.
   * @returns Formatted trailer block string.
   */
  formatTrailers(trailers: readonly ITrailer[]): string;

  /**
   * Search for a specific trailer key across commit history.
   * @param key - Trailer key to search for (e.g. 'AI-Decision').
   * @param options - Query options.
   * @returns Array of commits with matching trailers.
   */
  queryTrailers(key: string, options?: ITrailerQueryOptions): ICommitTrailers[];
}

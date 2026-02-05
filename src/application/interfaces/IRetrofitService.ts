/**
 * IRetrofitService
 *
 * Application service interface for annotating existing git history
 * with structured memory notes.
 */

/**
 * Options for retrofit operation.
 */
export interface IRetrofitOptions {
  /** Start date (default: 90 days ago). */
  readonly since?: Date;
  /** Maximum commits to process. */
  readonly maxCommits?: number;
  /** Preview without writing. */
  readonly dryRun?: boolean;
  /** Interest score threshold (default: 3). */
  readonly threshold?: number;
  /** Working directory. */
  readonly cwd?: string;
}

/**
 * Annotated commit from retrofit.
 */
export interface IRetrofitAnnotation {
  /** Commit SHA. */
  readonly sha: string;
  /** Commit subject. */
  readonly subject: string;
  /** Interest score. */
  readonly score: number;
  /** Number of facts extracted. */
  readonly factsExtracted: number;
  /** Extracted fact types. */
  readonly factTypes: readonly string[];
}

/**
 * Result of a retrofit operation.
 */
export interface IRetrofitResult {
  /** Total commits scanned. */
  readonly commitsScanned: number;
  /** Commits that received annotations. */
  readonly commitsAnnotated: number;
  /** Total facts extracted across all commits. */
  readonly factsExtracted: number;
  /** Individual annotations (for reporting). */
  readonly annotations: readonly IRetrofitAnnotation[];
  /** Whether this was a dry run. */
  readonly dryRun: boolean;
  /** Duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Retrofit service interface.
 */
export interface IRetrofitService {
  /**
   * Annotate existing commit history with AI metadata.
   * @param options - Retrofit options.
   * @returns Retrofit results.
   */
  retrofit(options?: IRetrofitOptions): Promise<IRetrofitResult>;
}

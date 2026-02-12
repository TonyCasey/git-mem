/**
 * ILiberateService
 *
 * Application service interface for annotating existing git history
 * with structured memory notes.
 */

/**
 * Progress update emitted during liberate processing.
 */
export interface ILiberateProgress {
  /** Current phase of processing. */
  readonly phase: 'triage' | 'enriching' | 'complete';
  /** Current commit index (1-based). */
  readonly current: number;
  /** Total high-interest commits to process. */
  readonly total: number;
  /** Current commit SHA (empty for triage/complete). */
  readonly sha: string;
  /** Current commit subject (empty for triage/complete). */
  readonly subject: string;
  /** Running total of facts extracted so far. */
  readonly factsExtracted: number;
}

/**
 * Options for liberate operation.
 */
export interface ILiberateOptions {
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
  /** Enable LLM enrichment (requires API key). */
  readonly enrich?: boolean;
  /** Optional progress callback for UI feedback. */
  readonly onProgress?: (progress: ILiberateProgress) => void;
}

/**
 * Annotated commit from liberate.
 */
export interface ILiberateAnnotation {
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
  /** Whether LLM enrichment contributed to this annotation. */
  readonly enrichedByLLM?: boolean;
}

/**
 * Statistics for LLM enrichment during liberate.
 */
export interface IEnrichmentStats {
  /** Commits successfully enriched by LLM. */
  readonly commitsEnriched: number;
  /** Commits where LLM enrichment failed (graceful degradation). */
  readonly commitsFailed: number;
  /** Total facts extracted by LLM. */
  readonly factsExtracted: number;
  /** Total input tokens consumed. */
  readonly totalInputTokens: number;
  /** Total output tokens consumed. */
  readonly totalOutputTokens: number;
}

/**
 * Result of a liberate operation.
 */
export interface ILiberateResult {
  /** Total commits scanned. */
  readonly commitsScanned: number;
  /** Commits that received annotations. */
  readonly commitsAnnotated: number;
  /** Total facts extracted across all commits. */
  readonly factsExtracted: number;
  /** Individual annotations (for reporting). */
  readonly annotations: readonly ILiberateAnnotation[];
  /** Whether this was a dry run. */
  readonly dryRun: boolean;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** LLM enrichment statistics (present when enrich: true). */
  readonly enrichment?: IEnrichmentStats;
}

/**
 * Liberate service interface.
 */
export interface ILiberateService {
  /**
   * Annotate existing commit history with AI metadata.
   * @param options - Liberate options.
   * @returns Liberate results.
   */
  liberate(options?: ILiberateOptions): Promise<ILiberateResult>;
}

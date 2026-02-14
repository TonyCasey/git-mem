/**
 * Pattern Match Types
 *
 * Domain types for heuristic pattern matching results.
 * These types define the contract for pattern extraction,
 * independent of the infrastructure implementation.
 */

/**
 * Fact types extractable by heuristic patterns.
 */
export type HeuristicFactType = 'decision' | 'gotcha' | 'convention';

/**
 * Confidence levels for pattern matches.
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Match result from pattern extraction.
 */
export interface IPatternMatch {
  /** The extracted text content. */
  readonly text: string;
  /** The fact type. */
  readonly factType: HeuristicFactType;
  /** The pattern name that matched. */
  readonly patternName: string;
  /** Confidence level. */
  readonly confidence: ConfidenceLevel;
  /** Start position in source text. */
  readonly startIndex: number;
}

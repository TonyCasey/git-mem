/**
 * ITrailer
 *
 * Represents a git commit trailer (key-value metadata in commit messages).
 * git-mem uses the AI-* prefix namespace for all trailers.
 *
 * Example trailer block in a commit message:
 *   AI-Decision: Use JWT over sessions for stateless API
 *   AI-Confidence: high
 *   AI-Tags: auth, api, architecture
 */

/**
 * A single commit trailer key-value pair.
 */
export interface ITrailer {
  /** Trailer key (e.g. 'AI-Decision', 'AI-Gotcha'). */
  readonly key: string;
  /** Trailer value. */
  readonly value: string;
}

/**
 * Standard AI-* trailer keys used by git-mem.
 */
export const AI_TRAILER_KEYS = {
  DECISION: 'AI-Decision',
  GOTCHA: 'AI-Gotcha',
  CONVENTION: 'AI-Convention',
  FACT: 'AI-Fact',
  CONFIDENCE: 'AI-Confidence',
  TAGS: 'AI-Tags',
  LIFECYCLE: 'AI-Lifecycle',
  MEMORY_ID: 'AI-Memory-Id',
  AGENT: 'AI-Agent',
} as const;

/**
 * The prefix for all git-mem trailers.
 */
export const AI_TRAILER_PREFIX = 'AI-';

/**
 * Check if a trailer key belongs to the AI-* namespace.
 */
export function isAiTrailer(key: string): boolean {
  return key.startsWith(AI_TRAILER_PREFIX);
}

/**
 * ICommitAnalyzer
 *
 * Interface for analyzing commit messages and staged files
 * to extract memory metadata (type, content, confidence, tags).
 */

import type { MemoryType } from '../../domain/entities/IMemoryEntity';
import type { ConfidenceLevel } from '../../domain/types/IMemoryQuality';

/**
 * Result of analyzing a commit message.
 */
export interface ICommitAnalysis {
  /** Detected memory type (decision, gotcha, convention, fact) or null if none. */
  readonly type: MemoryType | null;
  /** Extracted content text for the memory. */
  readonly content: string | null;
  /** Confidence level based on pattern strength. */
  readonly confidence: ConfidenceLevel;
  /** Inferred tags from scope, paths, and patterns. */
  readonly tags: readonly string[];
  /** Conventional commit type (feat, fix, refactor, etc.) or null. */
  readonly conventionalType: string | null;
  /** Conventional commit scope or null. */
  readonly scope: string | null;
  /** Pattern name that matched (for diagnostics). */
  readonly patternName: string | null;
}

/**
 * Parsed conventional commit components.
 */
export interface IConventionalCommit {
  /** Commit type (feat, fix, refactor, docs, etc.). */
  readonly type: string | null;
  /** Scope in parentheses (e.g., 'auth' from 'feat(auth):'). */
  readonly scope: string | null;
  /** Whether it's a breaking change (! suffix). */
  readonly breaking: boolean;
  /** The description/subject after the prefix. */
  readonly description: string;
  /** The commit body (everything after first blank line). */
  readonly body: string;
}

/**
 * Service interface for commit message analysis.
 */
export interface ICommitAnalyzer {
  /**
   * Analyze a commit message to extract memory metadata.
   *
   * @param message - The full commit message text
   * @param stagedFiles - List of staged file paths
   * @returns Analysis result with type, content, confidence, and tags
   */
  analyze(message: string, stagedFiles: readonly string[]): ICommitAnalysis;

  /**
   * Parse a commit message into conventional commit components.
   *
   * @param message - The commit message to parse
   * @returns Parsed conventional commit or components with nulls if not conventional
   */
  parseConventionalCommit(message: string): IConventionalCommit;
}

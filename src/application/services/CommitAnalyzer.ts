/**
 * CommitAnalyzer
 *
 * Analyzes commit messages to extract memory metadata:
 * - Memory type (decision, gotcha, convention, fact)
 * - Content text
 * - Confidence level
 * - Tags (from scope, paths, patterns)
 *
 * Uses HeuristicPatterns for pattern extraction and
 * conventional commit parsing for type inference.
 */

import type { MemoryType } from '../../domain/entities/IMemoryEntity';
import type { ConfidenceLevel } from '../../domain/types/IMemoryQuality';
import type {
  ICommitAnalyzer,
  ICommitAnalysis,
  IConventionalCommit,
} from '../interfaces/ICommitAnalyzer';
import {
  extractPatternMatches,
  type IPatternMatch,
} from '../../infrastructure/services/patterns/HeuristicPatterns';
import { inferTags } from './TagInference';

/**
 * Conventional commit regex.
 * Matches: type(scope)!: description
 * Groups: type, scope (optional), breaking (optional), description
 */
const CONVENTIONAL_COMMIT_REGEX =
  /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)/i;

/**
 * Map conventional commit types to memory types.
 * Priority 2 inference (after explicit pattern matches).
 */
const CONVENTIONAL_TYPE_MAP: Readonly<Record<string, MemoryType>> = {
  feat: 'decision',
  feature: 'decision',
  fix: 'gotcha',
  bugfix: 'gotcha',
  hotfix: 'gotcha',
  refactor: 'convention',
  style: 'convention',
  docs: 'fact',
  chore: 'fact',
  build: 'fact',
  ci: 'fact',
  test: 'fact',
  perf: 'decision',
};

export class CommitAnalyzer implements ICommitAnalyzer {
  /**
   * Analyze a commit message to extract memory metadata.
   */
  analyze(message: string, stagedFiles: readonly string[]): ICommitAnalysis {
    if (!message || message.trim().length === 0) {
      return this.emptyAnalysis();
    }

    // 1. Parse conventional commit format
    const conventional = this.parseConventionalCommit(message);

    // 2. Extract patterns using HeuristicPatterns
    const patterns = extractPatternMatches(message);

    // 3. Infer memory type (patterns take priority)
    const { type, patternName, content } = this.inferMemoryType(
      patterns,
      conventional,
      message
    );

    // 4. Calculate confidence
    const confidence = this.calculateConfidence(patterns, conventional, type);

    // 5. Infer tags
    const tags = inferTags(conventional.scope, stagedFiles, patterns);

    return {
      type,
      content,
      confidence,
      tags,
      conventionalType: conventional.type,
      scope: conventional.scope,
      patternName,
    };
  }

  /**
   * Parse a commit message into conventional commit components.
   */
  parseConventionalCommit(message: string): IConventionalCommit {
    const lines = message.split('\n');
    const firstLine = lines[0] || '';
    const body = lines.slice(1).join('\n').trim();

    const match = firstLine.match(CONVENTIONAL_COMMIT_REGEX);

    if (!match?.groups) {
      return {
        type: null,
        scope: null,
        breaking: false,
        description: firstLine,
        body,
      };
    }

    return {
      type: match.groups.type?.toLowerCase() ?? null,
      scope: match.groups.scope ?? null,
      breaking: match.groups.breaking === '!',
      description: match.groups.description ?? '',
      body,
    };
  }

  /**
   * Infer memory type from patterns and conventional commit type.
   */
  private inferMemoryType(
    patterns: IPatternMatch[],
    conventional: IConventionalCommit,
    _fullMessage: string
  ): { type: MemoryType | null; patternName: string | null; content: string | null } {
    // Priority 1: Explicit pattern match (decision/gotcha/convention patterns)
    if (patterns.length > 0) {
      const bestPattern = patterns[0];
      return {
        type: bestPattern.factType,
        patternName: bestPattern.patternName,
        content: bestPattern.text,
      };
    }

    // Priority 2: Conventional commit type mapping
    if (conventional.type) {
      const mappedType = CONVENTIONAL_TYPE_MAP[conventional.type];
      if (mappedType) {
        // For conventional commits without pattern matches, use description + body
        const content = conventional.body
          ? `${conventional.description}. ${conventional.body.split('\n')[0]}`
          : conventional.description;

        return {
          type: mappedType,
          patternName: `conventional:${conventional.type}`,
          content,
        };
      }
    }

    // No type detected
    return { type: null, patternName: null, content: null };
  }

  /**
   * Calculate confidence based on match quality.
   */
  private calculateConfidence(
    patterns: IPatternMatch[],
    conventional: IConventionalCommit,
    detectedType: MemoryType | null
  ): ConfidenceLevel {
    // If we have explicit patterns, use their confidence
    if (patterns.length > 0) {
      return patterns[0].confidence as ConfidenceLevel;
    }

    // Conventional commit inference
    if (conventional.type && detectedType) {
      // Breaking changes are high confidence
      if (conventional.breaking) return 'high';

      // feat/fix are well-established patterns
      if (conventional.type === 'feat' || conventional.type === 'fix') {
        return 'medium';
      }

      // Other types are lower confidence
      return 'low';
    }

    // No type detected
    return 'low';
  }

  /**
   * Return an empty analysis result.
   */
  private emptyAnalysis(): ICommitAnalysis {
    return {
      type: null,
      content: null,
      confidence: 'low',
      tags: [],
      conventionalType: null,
      scope: null,
      patternName: null,
    };
  }
}

/**
 * ContextService
 *
 * Scores stored memories for relevance against the currently staged git changes.
 * Extracts keywords from staged file paths and diff content, then matches
 * against memory content and tags.
 */

import type { IContextService, IContextOptions, IContextResult, IScoredMemory } from '../interfaces/IContextService';
import type { IGitClient } from '../../domain/interfaces/IGitClient';
import type { IMemoryRepository } from '../../domain/interfaces/IMemoryRepository';
import type { IMemoryEntity } from '../../domain/entities/IMemoryEntity';

export class ContextService implements IContextService {
  constructor(
    private readonly gitClient: IGitClient,
    private readonly memoryRepository: IMemoryRepository
  ) {}

  getContext(options?: IContextOptions): IContextResult {
    const cwd = options?.cwd;
    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0.1;

    const stagedFiles = this.gitClient.diffStagedNames(cwd);

    if (stagedFiles.length === 0) {
      return { files: [], memories: [], totalScanned: 0 };
    }

    const diffContent = this.gitClient.diffStaged(cwd);
    const keywords = this.extractKeywords(stagedFiles, diffContent);

    const allMemories = this.memoryRepository.query({ cwd });
    const scored: IScoredMemory[] = [];

    for (const memory of allMemories.memories) {
      const result = this.scoreMemory(memory, keywords, stagedFiles);
      if (result.score >= threshold) {
        scored.push(result);
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return {
      files: stagedFiles,
      memories: scored.slice(0, limit),
      totalScanned: allMemories.total,
    };
  }

  /**
   * Extract keywords from staged file paths and diff content.
   */
  private extractKeywords(files: readonly string[], diffContent: string): Set<string> {
    const keywords = new Set<string>();

    // Extract from file paths: directory names, file names without extension
    for (const filePath of files) {
      const parts = filePath.split('/');
      for (const part of parts) {
        // Strip extension from final part
        const name = part.replace(/\.[^.]+$/, '');
        if (name.length >= 3) {
          keywords.add(name.toLowerCase());
        }
      }
    }

    // Extract from diff: added/removed lines (skip diff metadata)
    const lines = diffContent.split('\n');
    for (const line of lines) {
      if (line.startsWith('+++ ') || line.startsWith('--- ')) continue;
      if (line.startsWith('@@')) continue;
      if (!line.startsWith('+') && !line.startsWith('-')) continue;

      // Get the content after +/- prefix
      const content = line.slice(1).trim();
      if (!content) continue;

      // Extract meaningful words (3+ chars, not common noise)
      const words = content.match(/[a-zA-Z_][a-zA-Z0-9_]{2,}/g);
      if (words) {
        for (const word of words) {
          if (!NOISE_WORDS.has(word.toLowerCase())) {
            keywords.add(word.toLowerCase());
          }
        }
      }
    }

    return keywords;
  }

  /**
   * Score a memory against the extracted keywords and staged files.
   */
  private scoreMemory(
    memory: IMemoryEntity,
    keywords: Set<string>,
    stagedFiles: readonly string[]
  ): IScoredMemory {
    let score = 0;
    const reasons: string[] = [];

    // Score content matches
    const contentWords = memory.content.toLowerCase().match(/[a-zA-Z_][a-zA-Z0-9_]{2,}/g) || [];
    const contentMatches = contentWords.filter(w => keywords.has(w));
    if (contentMatches.length > 0) {
      const uniqueMatches = [...new Set(contentMatches)];
      score += Math.min(uniqueMatches.length * 0.15, 0.6);
      reasons.push(`content: ${uniqueMatches.slice(0, 5).join(', ')}`);
    }

    // Score tag matches
    const tagMatches = memory.tags.filter(tag => keywords.has(tag.toLowerCase()));
    if (tagMatches.length > 0) {
      score += Math.min(tagMatches.length * 0.2, 0.4);
      reasons.push(`tags: ${tagMatches.join(', ')}`);
    }

    // Score file path matches (memory content mentions a staged file/directory)
    for (const filePath of stagedFiles) {
      const parts = filePath.toLowerCase().split('/');
      for (const part of parts) {
        const name = part.replace(/\.[^.]+$/, '');
        if (name.length >= 3 && memory.content.toLowerCase().includes(name)) {
          score += 0.15;
          reasons.push(`file: ${part}`);
          break;
        }
      }
    }

    // Clamp to [0, 1]
    score = Math.min(score, 1);

    return {
      memory,
      score,
      reason: reasons.join('; ') || 'no match',
    };
  }
}

/**
 * Common noise words to skip during keyword extraction.
 */
const NOISE_WORDS = new Set([
  'the', 'and', 'for', 'from', 'this', 'that', 'with', 'not', 'but', 'are',
  'was', 'has', 'have', 'had', 'will', 'can', 'may', 'should', 'would',
  'import', 'export', 'const', 'let', 'var', 'function', 'return', 'class',
  'new', 'null', 'undefined', 'true', 'false', 'void', 'async', 'await',
  'string', 'number', 'boolean', 'interface', 'type', 'enum', 'extends',
  'implements', 'private', 'public', 'protected', 'readonly', 'static',
  'require', 'module', 'exports', 'default', 'else', 'case', 'break',
  'continue', 'throw', 'try', 'catch', 'finally', 'typeof', 'instanceof',
]);

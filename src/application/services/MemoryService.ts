/**
 * MemoryService
 *
 * Application service that orchestrates memory operations.
 * Dual-writes to git notes (rich JSON) and commit trailers
 * (lightweight, natively queryable metadata).
 */

import type { IMemoryService } from '../interfaces/IMemoryService';
import type { IMemoryRepository, IMemoryQueryOptions, IMemoryQueryResult } from '../../domain/interfaces/IMemoryRepository';
import type { IMemoryEntity, ICreateMemoryOptions, MemoryType } from '../../domain/entities/IMemoryEntity';
import type { ITrailerService, ICommitTrailers } from '../../domain/interfaces/ITrailerService';
import type { ITrailer } from '../../domain/entities/ITrailer';
import { AI_TRAILER_KEYS, AI_TRAILER_PREFIX, MEMORY_TYPE_TO_TRAILER_KEY, TRAILER_KEY_TO_MEMORY_TYPE } from '../../domain/entities/ITrailer';
import type { ConfidenceLevel } from '../../domain/types/IMemoryQuality';
import { isValidConfidence } from '../../domain/types/IMemoryQuality';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class MemoryService implements IMemoryService {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly logger?: ILogger,
    private readonly trailerService?: ITrailerService,
  ) {}

  remember(text: string, options?: ICreateMemoryOptions): IMemoryEntity {
    const memory = this.memoryRepository.create(text, options);
    this.logger?.info('Memory stored', { id: memory.id, type: memory.type, sha: memory.sha });

    // Dual-write: also add AI-* trailers to the commit (opt-out via trailers: false)
    if (options?.trailers !== false && this.trailerService) {
      const targetSha = options?.sha;
      if (targetSha && targetSha !== 'HEAD') {
        // addTrailers amends HEAD — skip when targeting a specific non-HEAD commit
        // to avoid attaching trailers to the wrong commit
        this.logger?.warn('Skipping trailer write for non-HEAD commit', { sha: targetSha });
      } else {
        try {
          const trailers = this.buildTrailers(memory);
          this.trailerService.addTrailers(trailers, options?.cwd);
          this.logger?.info('Trailers written', { count: trailers.length, sha: memory.sha });
        } catch (err) {
          // Trailer write failure is non-fatal (commit may be pushed already)
          this.logger?.warn('Trailer write failed', {
            error: err instanceof Error ? err.message : String(err),
            sha: memory.sha,
          });
        }
      }
    }

    return memory;
  }

  /**
   * Sanitize a value for use as a git trailer.
   * Trailers are single-line by convention; embedded newlines would break parsing.
   */
  private normalizeTrailerValue(value: string): string {
    return value.replace(/\r?\n+/g, ' ').trim();
  }

  private buildTrailers(memory: IMemoryEntity): ITrailer[] {
    const trailers: ITrailer[] = [
      { key: MEMORY_TYPE_TO_TRAILER_KEY[memory.type], value: this.normalizeTrailerValue(memory.content) },
      { key: AI_TRAILER_KEYS.CONFIDENCE, value: memory.confidence },
      { key: AI_TRAILER_KEYS.MEMORY_ID, value: memory.id },
    ];

    if (memory.tags.length > 0) {
      trailers.push({ key: AI_TRAILER_KEYS.TAGS, value: this.normalizeTrailerValue(memory.tags.join(', ')) });
    }

    return trailers;
  }

  recall(query?: string, options?: IMemoryQueryOptions): IMemoryQueryResult {
    const effectiveQuery = query ?? options?.query;

    // 1. Search notes (existing path)
    const notesResult = this.memoryRepository.query({
      ...options,
      query: effectiveQuery,
    });

    // 2. Search trailers if service available
    if (!this.trailerService) {
      this.logger?.info('Memory recall', { query: effectiveQuery, count: notesResult.memories.length, total: notesResult.total });
      return notesResult;
    }

    const trailerMemories = this.recallFromTrailers(effectiveQuery, options, notesResult.memories);

    // 3. Merge results (notes first, then trailer-only)
    const allMemories = [...notesResult.memories, ...trailerMemories];
    const limit = options?.limit ?? allMemories.length;
    const merged = allMemories.slice(0, limit);

    // Total reflects the full match count: the notes repository may have paged
    // its results (notesResult.total > notesResult.memories.length), so we use
    // notesResult.total plus trailer-only results for accurate pagination semantics.
    const total = notesResult.total + trailerMemories.length;

    this.logger?.info('Memory recall', {
      query: effectiveQuery,
      notesCount: notesResult.memories.length,
      trailerCount: trailerMemories.length,
      total,
    });

    return {
      memories: merged,
      total,
    };
  }

  private recallFromTrailers(
    query: string | undefined,
    options: IMemoryQueryOptions | undefined,
    notesMemories: readonly IMemoryEntity[],
  ): IMemoryEntity[] {
    if (!this.trailerService) return [];

    try {
      const trailerCommits = this.trailerService.queryTrailers(AI_TRAILER_PREFIX, {
        cwd: options?.cwd,
        since: options?.since,
      });

      // IDs already present in notes results (for deduplication)
      const noteIds = new Set(notesMemories.map(m => m.id));

      const results: IMemoryEntity[] = [];

      for (const commit of trailerCommits) {
        const entities = this.trailerCommitToEntities(commit);

        for (const entity of entities) {
          // Deduplicate: skip if AI-Memory-Id matches a notes entry
          if (noteIds.has(entity.id)) continue;

          // Apply query filter
          if (query && !this.matchesQuery(entity, query)) continue;

          // Apply type filter
          if (options?.type && entity.type !== options.type) continue;

          // Apply tag filter (case-sensitive, consistent with MemoryRepository)
          if (options?.tag && !entity.tags.includes(options.tag)) continue;

          results.push(entity);
        }
      }

      return results;
    } catch (err) {
      this.logger?.warn('Trailer recall failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private trailerCommitToEntities(commit: ICommitTrailers): IMemoryEntity[] {
    const entities: IMemoryEntity[] = [];

    // Find all memory-type trailers on this commit
    const typeTrailers = commit.trailers.filter(t => t.key in TRAILER_KEY_TO_MEMORY_TYPE);
    if (typeTrailers.length === 0) return entities;

    // Collect all AI-Memory-Ids (one per remember() call)
    const memoryIds = commit.trailers
      .filter(t => t.key === AI_TRAILER_KEYS.MEMORY_ID)
      .map(t => t.value);

    // Shared metadata from the commit's trailers.
    //
    // NOTE: AI-Confidence and AI-Tags are treated as *commit-level* metadata.
    // All memory entities derived from this commit share the same values.
    // This matches dual-write behavior where a single remember() call emits
    // both rich JSON notes and lightweight commit trailers.
    //
    // Limitation: If someone manually adds multiple memory-type trailers with
    // different intended confidences/tags in the same commit, we do not attempt
    // per-memory metadata alignment. This is a known simplification.
    const rawConfidence = commit.trailers.find(t => t.key === AI_TRAILER_KEYS.CONFIDENCE)?.value || 'high';
    const confidence: ConfidenceLevel = isValidConfidence(rawConfidence) ? rawConfidence : 'high';
    const tagsStr = commit.trailers.find(t => t.key === AI_TRAILER_KEYS.TAGS)?.value;
    const tags: readonly string[] = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];

    // NOTE: Trailer-sourced memories use current time as createdAt/updatedAt.
    // Ideally we'd use the commit's author date, but that requires an extra
    // git log call per commit. This is a known limitation — the commit SHA
    // can be used to look up the actual date if needed.
    const now = new Date().toISOString();

    for (let i = 0; i < typeTrailers.length; i++) {
      const typeTrailer = typeTrailers[i];
      const type = TRAILER_KEY_TO_MEMORY_TYPE[typeTrailer.key] as MemoryType;
      if (!type) continue;

      // Pair with AI-Memory-Id by position, or generate synthetic ID.
      // Index suffix ensures uniqueness when a commit has multiple same-type trailers.
      const id = memoryIds[i] || `trailer:${commit.sha}:${type}:${i}`;

      entities.push({
        id,
        content: typeTrailer.value,
        type,
        sha: commit.sha,
        confidence,
        source: 'commit-trailer',
        lifecycle: 'project',
        tags,
        createdAt: now,
        updatedAt: now,
      });
    }

    return entities;
  }

  private matchesQuery(entity: IMemoryEntity, query: string): boolean {
    const lower = query.toLowerCase();
    return entity.content.toLowerCase().includes(lower) ||
      entity.tags.some(t => t.toLowerCase().includes(lower));
  }

  get(id: string, cwd?: string): IMemoryEntity | null {
    return this.memoryRepository.getById(id, cwd);
  }

  delete(id: string, cwd?: string): boolean {
    const deleted = this.memoryRepository.delete(id, cwd);
    this.logger?.info('Memory deleted', { id, deleted });
    return deleted;
  }
}

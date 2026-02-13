/**
 * ExtractService
 *
 * Application service that annotates existing git history with
 * structured memory notes by combining triage scoring with
 * heuristic pattern extraction and optional LLM enrichment.
 */

import type {
  IExtractService,
  IExtractOptions,
  IExtractResult,
  IExtractAnnotation,
  IEnrichmentStats,
} from '../interfaces/IExtractService';
import type { IGitTriageService } from '../../domain/interfaces/IGitTriageService';
import type { IMemoryRepository } from '../../domain/interfaces/IMemoryRepository';
import type { IGitClient } from '../../domain/interfaces/IGitClient';
import type { ITrailerService } from '../../domain/interfaces/ITrailerService';
import type { ILLMClient, ILLMExtractedFact } from '../../domain/interfaces/ILLMClient';
import type { MemoryType } from '../../domain/entities/IMemoryEntity';
import type { ConfidenceLevel } from '../../domain/types/IMemoryQuality';
import type { IPatternMatch } from '../../infrastructure/services/patterns/HeuristicPatterns';
import { extractPatternMatches } from '../../infrastructure/services/patterns/HeuristicPatterns';
import { extractWords, jaccardSimilarity } from '../../domain/utils/deduplication';
import { AI_TRAILER_KEYS } from '../../domain/entities/ITrailer';
import type { ILogger } from '../../domain/interfaces/ILogger';

/** Maximum diff length sent to LLM (chars). Truncated at line boundary. */
const MAX_DIFF_LENGTH = 15_000;

/** Jaccard similarity threshold for deduplication between heuristic and LLM facts. */
const DEDUP_THRESHOLD = 0.7;

/** Trailer key → MemoryType mapping. */
const TRAILER_KEY_TO_MEMORY_TYPE: Record<string, MemoryType> = {
  [AI_TRAILER_KEYS.DECISION]: 'decision',
  [AI_TRAILER_KEYS.GOTCHA]: 'gotcha',
  [AI_TRAILER_KEYS.CONVENTION]: 'convention',
  [AI_TRAILER_KEYS.FACT]: 'fact',
};

/** Uniform fact shape for merging heuristic, LLM, and trailer results. */
interface IUnifiedFact {
  readonly content: string;
  readonly type: MemoryType;
  readonly confidence: ConfidenceLevel;
  readonly tags: readonly string[];
  readonly source: 'heuristic-extraction' | 'llm-enrichment' | 'commit-trailer';
}

export class ExtractService implements IExtractService {
  constructor(
    private readonly triageService: IGitTriageService,
    private readonly memoryRepository: IMemoryRepository,
    private readonly gitClient?: IGitClient,
    private readonly llmClient?: ILLMClient,
    private readonly logger?: ILogger,
    private readonly trailerService?: ITrailerService,
  ) {}

  async extract(options?: IExtractOptions): Promise<IExtractResult> {
    const startTime = Date.now();
    const dryRun = options?.dryRun ?? false;
    const enrich = options?.enrich ?? false;
    const shouldEnrich = enrich && !!this.llmClient && !!this.gitClient;
    this.logger?.info('Extract started', { dryRun, enrich: shouldEnrich, maxCommits: options?.maxCommits });

    // Run triage to find interesting commits
    const triageResult = await this.triageService.triage({
      since: options?.since,
      until: undefined,
      threshold: options?.threshold,
      maxCommits: options?.maxCommits,
      cwd: options?.cwd,
      fetchAllStats: false,
    });

    const annotations: IExtractAnnotation[] = [];
    let totalFactsExtracted = 0;
    const enrichmentStats: IEnrichmentStats = {
      commitsEnriched: 0,
      commitsFailed: 0,
      factsExtracted: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    this.logger?.debug('Triage complete', { total: triageResult.totalCommits, highInterest: triageResult.highInterest.length });

    const highInterestTotal = triageResult.highInterest.length;
    options?.onProgress?.({ phase: 'triage', current: 0, total: highInterestTotal, sha: '', subject: '', factsExtracted: 0 });

    // Process each high-interest commit
    let commitIndex = 0;
    for (const scored of triageResult.highInterest) {
      commitIndex++;
      options?.onProgress?.({ phase: 'processing', current: commitIndex, total: highInterestTotal, sha: scored.commit.sha, subject: scored.commit.subject, factsExtracted: totalFactsExtracted });

      // Read existing AI-* trailers from this commit (authoritative, high-confidence)
      const trailerFacts = this.extractTrailerFacts(scored.commit.sha, options?.cwd);
      const trailerTypes = new Set(trailerFacts.map(f => f.type));

      // Heuristic extraction — skip types already covered by trailers
      const text = `${scored.commit.subject}\n${scored.commit.body}`.trim();
      const allHeuristicMatches = extractPatternMatches(text);
      const heuristicMatches = trailerTypes.size > 0
        ? allHeuristicMatches.filter(m => !trailerTypes.has(m.factType))
        : allHeuristicMatches;

      // LLM enrichment (if enabled)
      let llmFacts: ILLMExtractedFact[] = [];
      let enrichedByLLM = false;

      if (shouldEnrich) {
        try {
          const diff = this.gitClient!.getCommitDiff(scored.commit.sha, options?.cwd);
          const truncatedDiff = truncateDiff(diff, MAX_DIFF_LENGTH);
          const fileNames = extractFileNames(diff);

          const result = await this.llmClient!.enrichCommit({
            sha: scored.commit.sha,
            subject: scored.commit.subject,
            body: scored.commit.body,
            diff: truncatedDiff,
            filesChanged: fileNames,
          });

          llmFacts = [...result.facts];
          enrichedByLLM = llmFacts.length > 0;

          // Track enrichment stats (mutable accumulation)
          (enrichmentStats as { commitsEnriched: number }).commitsEnriched++;
          (enrichmentStats as { factsExtracted: number }).factsExtracted += llmFacts.length;
          (enrichmentStats as { totalInputTokens: number }).totalInputTokens += result.usage.inputTokens;
          (enrichmentStats as { totalOutputTokens: number }).totalOutputTokens += result.usage.outputTokens;
        } catch (err) {
          // Graceful degradation: LLM failure doesn't block heuristic results
          this.logger?.warn('LLM enrichment failed for commit', { sha: scored.commit.sha, error: err instanceof Error ? err.message : String(err) });
          (enrichmentStats as { commitsFailed: number }).commitsFailed++;
        }
      }

      // Merge trailer + heuristic + LLM facts with deduplication
      const mergedFacts = [...trailerFacts, ...mergeFacts(heuristicMatches, llmFacts)];

      if (mergedFacts.length === 0) continue;

      const factTypes = [...new Set(mergedFacts.map(f => f.type))];

      if (!dryRun) {
        for (const fact of mergedFacts) {
          const tags = fact.source === 'llm-enrichment'
            ? ['extract', 'llm-enrichment', ...fact.tags].join(', ')
            : `extract, ${fact.tags.join(', ')}`;

          this.memoryRepository.create(fact.content, {
            sha: scored.commit.sha,
            type: fact.type,
            confidence: fact.confidence,
            source: fact.source,
            tags,
            cwd: options?.cwd,
          });
        }
      }

      totalFactsExtracted += mergedFacts.length;
      annotations.push({
        sha: scored.commit.sha,
        subject: scored.commit.subject,
        score: scored.score,
        factsExtracted: mergedFacts.length,
        factTypes,
        enrichedByLLM,
      });
    }

    options?.onProgress?.({ phase: 'complete', current: highInterestTotal, total: highInterestTotal, sha: '', subject: '', factsExtracted: totalFactsExtracted });

    const result: IExtractResult = {
      commitsScanned: triageResult.totalCommits,
      commitsAnnotated: annotations.length,
      factsExtracted: totalFactsExtracted,
      annotations,
      dryRun,
      durationMs: Date.now() - startTime,
    };

    this.logger?.info('Extract complete', { scanned: result.commitsScanned, annotated: result.commitsAnnotated, facts: result.factsExtracted, durationMs: result.durationMs });

    if (enrich) {
      return { ...result, enrichment: enrichmentStats };
    }

    return result;
  }

  private extractTrailerFacts(sha: string, cwd?: string): IUnifiedFact[] {
    if (!this.trailerService) return [];

    try {
      const trailers = this.trailerService.readTrailers(sha, cwd);
      if (trailers.length === 0) return [];

      const facts: IUnifiedFact[] = [];
      const confidence = (trailers.find(t => t.key === AI_TRAILER_KEYS.CONFIDENCE)?.value || 'high') as ConfidenceLevel;
      const tagsStr = trailers.find(t => t.key === AI_TRAILER_KEYS.TAGS)?.value;
      const tags: string[] = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];

      for (const trailer of trailers) {
        const type = TRAILER_KEY_TO_MEMORY_TYPE[trailer.key];
        if (!type) continue;

        facts.push({
          content: trailer.value,
          type,
          confidence,
          tags,
          source: 'commit-trailer',
        });
      }

      return facts;
    } catch {
      return [];
    }
  }
}

/**
 * Truncate a diff to maxLength characters at a line boundary.
 */
export function truncateDiff(diff: string, maxLength: number): string {
  if (diff.length <= maxLength) return diff;

  const truncated = diff.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');
  return lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;
}

/**
 * Extract file names from a unified diff.
 * Looks for +++ b/path lines.
 */
export function extractFileNames(diff: string): string[] {
  const files: string[] = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      files.push(line.slice(6));
    }
  }
  return files;
}

/**
 * Merge heuristic pattern matches with LLM-extracted facts.
 * Deduplicates using Jaccard similarity — LLM version wins on conflicts.
 */
export function mergeFacts(
  heuristicMatches: IPatternMatch[],
  llmFacts: ILLMExtractedFact[]
): IUnifiedFact[] {
  // Convert heuristic matches to unified shape
  const heuristicFacts: IUnifiedFact[] = heuristicMatches.map(m => ({
    content: m.text,
    type: m.factType,
    confidence: m.confidence,
    tags: [`pattern:${m.patternName}`],
    source: 'heuristic-extraction' as const,
  }));

  // Convert LLM facts to unified shape
  const llmUnified: IUnifiedFact[] = llmFacts.map(f => ({
    content: f.content,
    type: f.type,
    confidence: f.confidence,
    tags: [...f.tags],
    source: 'llm-enrichment' as const,
  }));

  if (llmUnified.length === 0) return heuristicFacts;
  if (heuristicFacts.length === 0) return llmUnified;

  // Start with all LLM facts (they win on conflicts)
  const merged: IUnifiedFact[] = [...llmUnified];

  // Pre-compute word sets for LLM facts
  const llmWordSets = llmUnified.map(f => extractWords(f.content));

  // Add heuristic facts that aren't duplicates of LLM facts
  for (const hFact of heuristicFacts) {
    const hWords = extractWords(hFact.content);
    const isDuplicate = llmWordSets.some(
      llmWords => jaccardSimilarity(hWords, llmWords) > DEDUP_THRESHOLD
    );

    if (!isDuplicate) {
      merged.push(hFact);
    }
  }

  return merged;
}

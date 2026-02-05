/**
 * RetrofitService
 *
 * Application service that annotates existing git history with
 * structured memory notes by combining triage scoring with
 * heuristic pattern extraction.
 */

import type {
  IRetrofitService,
  IRetrofitOptions,
  IRetrofitResult,
  IRetrofitAnnotation,
} from '../interfaces/IRetrofitService';
import type { IGitTriageService } from '../../domain/interfaces/IGitTriageService';
import type { IMemoryRepository } from '../../domain/interfaces/IMemoryRepository';
import { extractPatternMatches } from '../../infrastructure/services/patterns/HeuristicPatterns';

export class RetrofitService implements IRetrofitService {
  constructor(
    private readonly triageService: IGitTriageService,
    private readonly memoryRepository: IMemoryRepository
  ) {}

  async retrofit(options?: IRetrofitOptions): Promise<IRetrofitResult> {
    const startTime = Date.now();
    const dryRun = options?.dryRun ?? false;

    // Run triage to find interesting commits
    const triageResult = await this.triageService.triage({
      since: options?.since,
      until: undefined,
      threshold: options?.threshold,
      maxCommits: options?.maxCommits,
      cwd: options?.cwd,
      fetchAllStats: false,
    });

    const annotations: IRetrofitAnnotation[] = [];
    let totalFactsExtracted = 0;

    // Process each high-interest commit
    for (const scored of triageResult.highInterest) {
      const text = `${scored.commit.subject}\n${scored.commit.body}`.trim();
      const matches = extractPatternMatches(text);

      if (matches.length === 0) continue;

      const factTypes = [...new Set(matches.map(m => m.factType))];

      if (!dryRun) {
        // Write each extracted fact as a memory
        for (const match of matches) {
          this.memoryRepository.create(match.text, {
            sha: scored.commit.sha,
            type: match.factType,
            confidence: match.confidence,
            source: 'heuristic-extraction',
            tags: `retrofit, pattern:${match.patternName}`,
            cwd: options?.cwd,
          });
        }
      }

      totalFactsExtracted += matches.length;
      annotations.push({
        sha: scored.commit.sha,
        subject: scored.commit.subject,
        score: scored.score,
        factsExtracted: matches.length,
        factTypes,
      });
    }

    return {
      commitsScanned: triageResult.totalCommits,
      commitsAnnotated: annotations.length,
      factsExtracted: totalFactsExtracted,
      annotations,
      dryRun,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * CommitMsgHandler
 *
 * Handles the commit-msg git hook event.
 * Analyzes the commit message, infers memory metadata,
 * and appends AI-* trailers to the commit message file.
 *
 * When LLM enrichment is enabled and available, uses Claude to generate
 * richer trailer content based on the staged diff. Falls back to heuristic
 * analysis if enrichment fails or is unavailable.
 */

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { IEventHandler } from '../../domain/interfaces/IEventHandler';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { ICommitMsgEvent } from '../../domain/events/HookEvents';
import type { ICommitAnalyzer } from '../interfaces/ICommitAnalyzer';
import type { IGitClient } from '../../domain/interfaces/IGitClient';
import type { ILogger } from '../../domain/interfaces/ILogger';
import type { ITrailer } from '../../domain/entities/ITrailer';
import {
  AI_TRAILER_KEYS,
  MEMORY_TYPE_TO_TRAILER_KEY,
} from '../../domain/entities/ITrailer';
import type { IAgentResolver } from '../../domain/interfaces/IAgentResolver';
import type { IHookConfigLoader } from '../../domain/interfaces/IHookConfigLoader';
import type { ICommitMsgConfig } from '../../domain/interfaces/IHookConfig';
import type { ILLMClient, ILLMExtractedFact } from '../../domain/interfaces/ILLMClient';

/** Maximum diff size to send to LLM (10KB). */
const MAX_DIFF_LENGTH = 10_000;

export class CommitMsgHandler implements IEventHandler<ICommitMsgEvent> {
  constructor(
    private readonly commitAnalyzer: ICommitAnalyzer,
    private readonly gitClient: IGitClient,
    private readonly logger: ILogger,
    private readonly agentResolver: IAgentResolver,
    private readonly configLoader: IHookConfigLoader,
    private readonly llmClient?: ILLMClient | null,
  ) {}

  async handle(event: ICommitMsgEvent): Promise<IEventResult> {
    try {
      // 0. Load config via injected loader
      const hookConfig = this.configLoader.loadConfig(event.cwd);
      const config = hookConfig.hooks.commitMsg;

      // 1. Read the commit message file
      const message = readFileSync(event.commitMsgPath, 'utf8');

      // 2. Check if full analysis already done (AI-Memory-Id indicates commit-msg hook has run)
      if (message.includes('AI-Memory-Id:')) {
        this.logger.debug('Full analysis already done, skipping');
        return { handler: 'CommitMsgHandler', success: true };
      }

      // 3. Skip special commit types that don't benefit from analysis
      const skipReason = this.shouldSkipAnalysis(message);
      if (skipReason) {
        this.logger.debug(`Skipping analysis: ${skipReason}`);
        return { handler: 'CommitMsgHandler', success: true };
      }

      // 4. Check autoAnalyze config - if false, only add basic Agent/Model trailers
      if (!config.autoAnalyze) {
        this.logger.debug('autoAnalyze is false, adding only Agent/Model trailers');
        const basicTrailers = this.buildBasicTrailers(message);
        await this.appendTrailers(event.commitMsgPath, basicTrailers, event.cwd);
        return { handler: 'CommitMsgHandler', success: true };
      }

      // 5. Get staged files (for tags and enrichment)
      const stagedFiles = this.gitClient.diffStagedNames(event.cwd);

      // 6. Attempt LLM enrichment if enabled and available
      const shouldEnrich = config.enrich && this.llmClient != null;
      let enrichedFacts: ILLMExtractedFact[] | null = null;

      if (shouldEnrich) {
        enrichedFacts = await this.attemptEnrichment(
          message,
          stagedFiles,
          config.enrichTimeout,
          event.cwd,
        );
      }

      // 7. Build trailers - use enrichment if available, else heuristic
      let trailers: ITrailer[];
      let source: 'llm-enrichment' | 'heuristic';

      if (enrichedFacts && enrichedFacts.length > 0) {
        trailers = this.buildEnrichedTrailers(enrichedFacts, config, message);
        source = 'llm-enrichment';
      } else {
        // Fallback to heuristic analysis
        const analysis = this.commitAnalyzer.analyze(message, stagedFiles);

        // Check requireType config - skip if no type detected and requireType is true
        if (config.requireType && !analysis.type) {
          this.logger.debug('No memory type detected and requireType is true, skipping');
          return { handler: 'CommitMsgHandler', success: true };
        }

        trailers = this.buildTrailers(analysis, config, message);
        source = 'heuristic';
      }

      // 8. Append trailers to the commit message using git interpret-trailers
      await this.appendTrailers(event.commitMsgPath, trailers, event.cwd);

      this.logger.info('Commit message analyzed and trailers added', {
        source,
        trailerCount: trailers.length,
      });

      return {
        handler: 'CommitMsgHandler',
        success: true,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to process commit-msg hook', {
        error: err.message,
        stack: err.stack,
      });
      return {
        handler: 'CommitMsgHandler',
        success: false,
        error: err,
      };
    }
  }

  /**
   * Attempt LLM enrichment with timeout.
   * Returns extracted facts on success, null on failure or timeout.
   */
  private async attemptEnrichment(
    message: string,
    stagedFiles: string[],
    timeoutMs: number,
    cwd: string,
  ): Promise<ILLMExtractedFact[] | null> {
    if (!this.llmClient) return null;

    try {
      // Get staged diff for LLM context
      const diff = this.gitClient.diffStaged(cwd);
      const truncatedDiff = this.truncateDiff(diff, MAX_DIFF_LENGTH);

      // Parse commit message for LLM input
      const lines = message.split('\n');
      const subject = lines[0] || '';
      const body = lines.slice(2).join('\n').trim(); // Skip blank line after subject

      // Race enrichment against timeout
      const enrichmentPromise = this.llmClient.enrichCommit({
        sha: 'staged', // No SHA yet - use placeholder
        subject,
        body,
        diff: truncatedDiff,
        filesChanged: stagedFiles,
      });

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      });

      const result = await Promise.race([enrichmentPromise, timeoutPromise]);

      // Clear timeout if enrichment completed first
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (result === null) {
        this.logger.warn('LLM enrichment timed out', { timeoutMs });
        return null;
      }

      this.logger.debug('LLM enrichment successful', {
        factsExtracted: result.facts.length,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });

      return [...result.facts];
    } catch (error) {
      this.logger.warn('LLM enrichment failed, falling back to heuristic', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Truncate diff to max length, preserving line boundaries.
   */
  private truncateDiff(diff: string, maxLength: number): string {
    if (diff.length <= maxLength) return diff;
    const truncated = diff.slice(0, maxLength);
    const lastNewline = truncated.lastIndexOf('\n');
    return lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;
  }

  /**
   * Check if analysis should be skipped for special commit types.
   * Returns the skip reason, or null if analysis should proceed.
   */
  private shouldSkipAnalysis(message: string): string | null {
    const firstLine = message.split('\n')[0] || '';

    // Skip merge commits (auto-generated by git)
    if (/^Merge (branch|pull request|remote-tracking)/i.test(firstLine)) {
      return 'merge commit';
    }

    // Skip fixup/squash/amend commits (will be squashed later)
    if (/^(fixup|squash|amend)! /i.test(firstLine)) {
      return 'fixup/squash commit';
    }

    // Skip revert commits (auto-generated)
    if (/^Revert "/i.test(firstLine)) {
      return 'revert commit';
    }

    return null;
  }

  /**
   * Build basic AI-Agent and AI-Model trailers only (when autoAnalyze is false).
   * Skips if already present from prepare-commit-msg.
   */
  private buildBasicTrailers(existingMessage: string): ITrailer[] {
    const trailers: ITrailer[] = [];
    const hasAgent = existingMessage.includes('AI-Agent:');
    const hasModel = existingMessage.includes('AI-Model:');

    if (!hasAgent) {
      const agent = this.agentResolver.resolveAgent();
      if (agent) {
        trailers.push({ key: AI_TRAILER_KEYS.AGENT, value: agent });
      }
    }
    if (!hasModel) {
      const model = this.agentResolver.resolveModel();
      if (model) {
        trailers.push({ key: AI_TRAILER_KEYS.MODEL, value: model });
      }
    }

    return trailers;
  }

  /**
   * Build trailers from LLM enrichment results.
   */
  private buildEnrichedTrailers(
    facts: ILLMExtractedFact[],
    config: ICommitMsgConfig,
    existingMessage: string,
  ): ITrailer[] {
    const trailers: ITrailer[] = [];

    // Agent and Model trailers (skip if already present)
    const hasAgent = existingMessage.includes('AI-Agent:');
    const hasModel = existingMessage.includes('AI-Model:');

    if (!hasAgent) {
      const agent = this.agentResolver.resolveAgent();
      if (agent) trailers.push({ key: AI_TRAILER_KEYS.AGENT, value: agent });
    }
    if (!hasModel) {
      const model = this.agentResolver.resolveModel();
      if (model) trailers.push({ key: AI_TRAILER_KEYS.MODEL, value: model });
    }

    // Select best fact for primary trailer (highest priority type/confidence)
    const bestFact = this.selectBestFact(facts);

    if (bestFact) {
      const trailerKey = MEMORY_TYPE_TO_TRAILER_KEY[bestFact.type];
      if (trailerKey) {
        const truncatedContent = bestFact.content.slice(0, 200);
        trailers.push({ key: trailerKey, value: truncatedContent });
      }

      // Use confidence from LLM
      trailers.push({ key: AI_TRAILER_KEYS.CONFIDENCE, value: bestFact.confidence });

      // Merge tags from all facts (respect inferTags setting)
      if (config.inferTags) {
        const allTags = new Set<string>();
        for (const fact of facts) {
          for (const tag of fact.tags) {
            allTags.add(tag);
          }
        }
        if (allTags.size > 0) {
          trailers.push({ key: AI_TRAILER_KEYS.TAGS, value: [...allTags].join(', ') });
        }
      }
    }

    // Lifecycle from config
    trailers.push({ key: AI_TRAILER_KEYS.LIFECYCLE, value: config.defaultLifecycle });

    // Memory ID
    trailers.push({ key: AI_TRAILER_KEYS.MEMORY_ID, value: this.generateMemoryId() });

    // Source indicator
    trailers.push({ key: AI_TRAILER_KEYS.SOURCE, value: 'llm-enrichment' });

    return trailers;
  }

  /**
   * Select the best fact from LLM results.
   * Priority: decision > gotcha > convention > fact
   * Within same type: verified > high > medium > low
   */
  private selectBestFact(facts: ILLMExtractedFact[]): ILLMExtractedFact | null {
    if (facts.length === 0) return null;

    const typePriority: Record<string, number> = {
      decision: 4,
      gotcha: 3,
      convention: 2,
      fact: 1,
    };

    const confidencePriority: Record<string, number> = {
      verified: 4,
      high: 3,
      medium: 2,
      low: 1,
      uncertain: 0,
    };

    return [...facts].sort((a, b) => {
      const typeDiff = (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
      if (typeDiff !== 0) return typeDiff;
      return (confidencePriority[b.confidence] || 0) - (confidencePriority[a.confidence] || 0);
    })[0];
  }

  /**
   * Build all AI-* trailers from the heuristic analysis result.
   * Skips Agent/Model if they already exist (from prepare-commit-msg).
   */
  private buildTrailers(
    analysis: ReturnType<ICommitAnalyzer['analyze']>,
    config: ICommitMsgConfig,
    existingMessage: string
  ): ITrailer[] {
    const trailers: ITrailer[] = [];

    // Only add Agent and Model if not already present (prepare-commit-msg may have added them)
    const hasAgent = existingMessage.includes('AI-Agent:');
    const hasModel = existingMessage.includes('AI-Model:');

    if (!hasAgent) {
      const agent = this.agentResolver.resolveAgent();
      if (agent) {
        trailers.push({ key: AI_TRAILER_KEYS.AGENT, value: agent });
      }
    }
    if (!hasModel) {
      const model = this.agentResolver.resolveModel();
      if (model) {
        trailers.push({ key: AI_TRAILER_KEYS.MODEL, value: model });
      }
    }

    // Add type-specific trailer if we detected a type
    if (analysis.type && analysis.content) {
      const trailerKey = MEMORY_TYPE_TO_TRAILER_KEY[analysis.type];
      if (trailerKey) {
        // Truncate content to reasonable length for trailer
        const truncatedContent = analysis.content.slice(0, 200);
        trailers.push({ key: trailerKey, value: truncatedContent });
      }
    }

    // Add confidence
    trailers.push({ key: AI_TRAILER_KEYS.CONFIDENCE, value: analysis.confidence });

    // Add tags if we have any and inferTags is enabled
    if (config.inferTags && analysis.tags.length > 0) {
      trailers.push({ key: AI_TRAILER_KEYS.TAGS, value: analysis.tags.join(', ') });
    }

    // Add lifecycle from config
    trailers.push({ key: AI_TRAILER_KEYS.LIFECYCLE, value: config.defaultLifecycle });

    // Add memory ID for tracking
    trailers.push({ key: AI_TRAILER_KEYS.MEMORY_ID, value: this.generateMemoryId() });

    // Source indicator for heuristic analysis
    trailers.push({ key: AI_TRAILER_KEYS.SOURCE, value: 'heuristic' });

    return trailers;
  }

  /**
   * Append trailers to the commit message file using git interpret-trailers.
   */
  private async appendTrailers(
    commitMsgPath: string,
    trailers: ITrailer[],
    cwd: string
  ): Promise<void> {
    if (trailers.length === 0) return;

    // Build the trailer args
    const args = ['interpret-trailers', '--in-place'];
    for (const trailer of trailers) {
      args.push('--trailer', `${trailer.key}: ${trailer.value}`);
    }
    args.push(commitMsgPath);

    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /**
   * Generate a short memory ID (first 8 chars of UUID).
   */
  private generateMemoryId(): string {
    return randomUUID().slice(0, 8);
  }
}

/**
 * CommitMsgHandler
 *
 * Handles the commit-msg git hook event.
 * Analyzes the commit message, infers memory metadata,
 * and appends AI-* trailers to the commit message file.
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
import { resolveAgent, resolveModel } from '../../infrastructure/detect-agent';
import { loadHookConfig } from '../../hooks/utils/config';
import type { ICommitMsgConfig } from '../../domain/interfaces/IHookConfig';

export class CommitMsgHandler implements IEventHandler<ICommitMsgEvent> {
  constructor(
    private readonly commitAnalyzer: ICommitAnalyzer,
    private readonly gitClient: IGitClient,
    private readonly logger: ILogger
  ) {}

  async handle(event: ICommitMsgEvent): Promise<IEventResult> {
    try {
      // 0. Load config
      const hookConfig = loadHookConfig(event.cwd);
      const config = hookConfig.hooks.commitMsg;

      // 1. Read the commit message file
      const message = readFileSync(event.commitMsgPath, 'utf8');

      // 2. Check if AI-Agent trailer already exists (avoid duplicates from prepare-commit-msg)
      if (message.includes('AI-Agent:')) {
        this.logger.debug('AI trailers already present, skipping analysis');
        return { handler: 'CommitMsgHandler', success: true };
      }

      // 3. Check autoAnalyze config - if false, only add basic Agent/Model trailers
      if (!config.autoAnalyze) {
        this.logger.debug('autoAnalyze is false, adding only Agent/Model trailers');
        const basicTrailers = this.buildBasicTrailers();
        await this.appendTrailers(event.commitMsgPath, basicTrailers, event.cwd);
        return { handler: 'CommitMsgHandler', success: true };
      }

      // 4. Get staged files (only if inferTags is enabled)
      const stagedFiles = config.inferTags
        ? this.gitClient.diffStagedNames(event.cwd)
        : [];

      // 5. Analyze the commit message
      const analysis = this.commitAnalyzer.analyze(message, stagedFiles);

      // 6. Check requireType config - skip if no type detected and requireType is true
      if (config.requireType && !analysis.type) {
        this.logger.debug('No memory type detected and requireType is true, skipping');
        return { handler: 'CommitMsgHandler', success: true };
      }

      // 7. Build trailers (skip tags if inferTags is false)
      const trailers = this.buildTrailers(analysis, config);

      // 8. Append trailers to the commit message using git interpret-trailers
      await this.appendTrailers(event.commitMsgPath, trailers, event.cwd);

      this.logger.info('Commit message analyzed and trailers added', {
        type: analysis.type,
        tags: analysis.tags,
        confidence: analysis.confidence,
        trailerCount: trailers.length,
      });

      return {
        handler: 'CommitMsgHandler',
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to process commit-msg hook', { error });
      return {
        handler: 'CommitMsgHandler',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Build basic AI-Agent and AI-Model trailers only (when autoAnalyze is false).
   */
  private buildBasicTrailers(): ITrailer[] {
    const trailers: ITrailer[] = [];
    const agent = resolveAgent();
    const model = resolveModel();

    if (agent) {
      trailers.push({ key: AI_TRAILER_KEYS.AGENT, value: agent });
    }
    if (model) {
      trailers.push({ key: AI_TRAILER_KEYS.MODEL, value: model });
    }

    return trailers;
  }

  /**
   * Build all AI-* trailers from the analysis result.
   */
  private buildTrailers(
    analysis: ReturnType<ICommitAnalyzer['analyze']>,
    config: ICommitMsgConfig
  ): ITrailer[] {
    const trailers: ITrailer[] = [];

    // Always add Agent and Model
    const agent = resolveAgent();
    const model = resolveModel();

    if (agent) {
      trailers.push({ key: AI_TRAILER_KEYS.AGENT, value: agent });
    }
    if (model) {
      trailers.push({ key: AI_TRAILER_KEYS.MODEL, value: model });
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

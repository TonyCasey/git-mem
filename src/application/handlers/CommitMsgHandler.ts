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

export class CommitMsgHandler implements IEventHandler<ICommitMsgEvent> {
  constructor(
    private readonly commitAnalyzer: ICommitAnalyzer,
    private readonly gitClient: IGitClient,
    private readonly logger: ILogger
  ) {}

  async handle(event: ICommitMsgEvent): Promise<IEventResult> {
    try {
      // 1. Read the commit message file
      const message = readFileSync(event.commitMsgPath, 'utf8');

      // 2. Get staged files
      const stagedFiles = this.gitClient.diffStagedNames(event.cwd);

      // 3. Analyze the commit message
      const analysis = this.commitAnalyzer.analyze(message, stagedFiles);

      // 4. Build trailers
      const trailers = this.buildTrailers(analysis);

      // 5. Append trailers to the commit message using git interpret-trailers
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
   * Build all AI-* trailers from the analysis result.
   */
  private buildTrailers(analysis: ReturnType<ICommitAnalyzer['analyze']>): ITrailer[] {
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

    // Add tags if we have any
    if (analysis.tags.length > 0) {
      trailers.push({ key: AI_TRAILER_KEYS.TAGS, value: analysis.tags.join(', ') });
    }

    // Add lifecycle (default to project)
    trailers.push({ key: AI_TRAILER_KEYS.LIFECYCLE, value: 'project' });

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

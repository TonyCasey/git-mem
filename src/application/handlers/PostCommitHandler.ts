/**
 * PostCommitHandler
 *
 * Handles the git:commit event by writing session metadata as a git note.
 * Preserves any existing memories on the commit while adding/updating
 * the session field with agent, model, and timestamp.
 */

import type { IPostCommitHandler } from '../interfaces/IPostCommitHandler';
import type { IGitCommitEvent } from '../../domain/events/HookEvents';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { INotesService } from '../../domain/interfaces/INotesService';
import type { ILogger } from '../../domain/interfaces/ILogger';
import { resolveAgent, resolveModel } from '../../infrastructure/detect-agent';

/**
 * Session metadata stored in the note's `session` field.
 */
interface ISessionMetadata {
  agent: string;
  model?: string;
  timestamp: string;
}

/**
 * Note payload structure.
 * The `memories` array is managed by MemoryRepository.
 * The `session` field is managed by this handler.
 */
interface INotePayload {
  memories?: unknown[];
  session?: ISessionMetadata;
}

export class PostCommitHandler implements IPostCommitHandler {
  constructor(
    private readonly notesService: INotesService,
    private readonly logger?: ILogger,
  ) {}

  async handle(event: IGitCommitEvent): Promise<IEventResult> {
    try {
      const agent = resolveAgent();
      const model = resolveModel();

      // No agent detected — exit silently (not an AI-assisted commit)
      if (!agent) {
        this.logger?.debug('No AI agent detected, skipping session note');
        return {
          handler: 'PostCommitHandler',
          success: true,
        };
      }

      this.logger?.info('Post-commit handler invoked', {
        sha: event.sha,
        agent,
        model,
      });

      // Read existing note payload
      const payload = this.readPayload(event.sha, event.cwd);

      // Add/update session metadata
      payload.session = {
        agent,
        model,
        timestamp: new Date().toISOString(),
      };

      // Write back
      this.writePayload(event.sha, payload, event.cwd);

      this.logger?.info('Session note written', {
        sha: event.sha,
        hasMemories: Array.isArray(payload.memories) && payload.memories.length > 0,
      });

      return {
        handler: 'PostCommitHandler',
        success: true,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('Post-commit handler failed', {
        error: err.message,
        stack: err.stack,
      });
      return {
        handler: 'PostCommitHandler',
        success: false,
        error: err,
      };
    }
  }

  /**
   * Read and parse the existing note payload.
   * Returns empty object if no note exists or parsing fails.
   */
  private readPayload(sha: string, cwd: string): INotePayload {
    const raw = this.notesService.read(sha, undefined, cwd);
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as INotePayload;
      }
      return {};
    } catch {
      // Malformed JSON — return empty and let write overwrite
      this.logger?.warn('Malformed note JSON, will overwrite', { sha });
      return {};
    }
  }

  /**
   * Serialize and write the payload to the note.
   */
  private writePayload(sha: string, payload: INotePayload, cwd: string): void {
    const json = JSON.stringify(payload, null, 2);
    this.notesService.write(sha, json, undefined, cwd);
  }
}

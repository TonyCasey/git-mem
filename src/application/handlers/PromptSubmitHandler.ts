/**
 * PromptSubmitHandler
 *
 * Handles the prompt:submit event by loading relevant memories
 * and formatting them as context for Claude Code.
 */

import type { IPromptSubmitHandler } from '../interfaces/IPromptSubmitHandler';
import type { IPromptSubmitEvent } from '../../domain/events/HookEvents';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { IMemoryContextLoader } from '../../domain/interfaces/IMemoryContextLoader';
import type { IContextFormatter } from '../../domain/interfaces/IContextFormatter';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class PromptSubmitHandler implements IPromptSubmitHandler {
  constructor(
    private readonly memoryContextLoader: IMemoryContextLoader,
    private readonly contextFormatter: IContextFormatter,
    private readonly logger?: ILogger,
  ) {}

  async handle(event: IPromptSubmitEvent): Promise<IEventResult> {
    try {
      this.logger?.info('Prompt submit handler invoked', {
        sessionId: event.sessionId,
        cwd: event.cwd,
      });

      const result = this.memoryContextLoader.load({ cwd: event.cwd });

      if (result.memories.length === 0) {
        this.logger?.debug('No memories found for prompt context');
        return {
          handler: 'PromptSubmitHandler',
          success: true,
          output: '',
        };
      }

      const output = this.contextFormatter.format(result.memories);

      this.logger?.info('Memories loaded for prompt context', {
        total: result.total,
        filtered: result.filtered,
      });

      return {
        handler: 'PromptSubmitHandler',
        success: true,
        output,
      };
    } catch (error) {
      this.logger?.error('Prompt submit handler failed', { error });
      return {
        handler: 'PromptSubmitHandler',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

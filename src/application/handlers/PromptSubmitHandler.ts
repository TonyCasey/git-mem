/**
 * PromptSubmitHandler
 *
 * Handles the prompt:submit event by loading relevant memories
 * and formatting them as context for Claude Code.
 *
 * When intent extraction is enabled, extracts searchable keywords
 * from the prompt and queries memories with those keywords.
 * Falls back to loading recent memories if extraction is skipped
 * or no keywords are found.
 * Optionally includes commit message bodies for additional context.
 */

import type { IPromptSubmitHandler } from '../interfaces/IPromptSubmitHandler';
import type { IPromptSubmitEvent } from '../../domain/events/HookEvents';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { IMemoryContextLoader, IMemoryContextResult } from '../../domain/interfaces/IMemoryContextLoader';
import type { IContextFormatter } from '../../domain/interfaces/IContextFormatter';
import type { ILogger } from '../../domain/interfaces/ILogger';
import type { IHookConfigLoader } from '../../domain/interfaces/IHookConfigLoader';
import type { IIntentExtractor } from '../../domain/interfaces/IIntentExtractor';

export class PromptSubmitHandler implements IPromptSubmitHandler {
  constructor(
    private readonly memoryContextLoader: IMemoryContextLoader,
    private readonly contextFormatter: IContextFormatter,
    private readonly logger?: ILogger,
    private readonly hookConfigLoader?: IHookConfigLoader,
    private readonly intentExtractor?: IIntentExtractor | null,
  ) {}

  async handle(event: IPromptSubmitEvent): Promise<IEventResult> {
    try {
      this.logger?.info('Prompt submit handler invoked', {
        sessionId: event.sessionId,
        cwd: event.cwd,
        hasPrompt: !!event.prompt,
      });

      // Load config
      const config = this.hookConfigLoader?.loadConfig(event.cwd);
      const promptConfig = config?.hooks.promptSubmit ?? {
        surfaceContext: true,
        extractIntent: false,
        memoryLimit: 20,
        minWords: 5,
        intentTimeout: 3000,
        includeCommitMessages: true,
      };

      // Early exit if context surfacing is disabled
      if (!promptConfig.surfaceContext) {
        this.logger?.debug('Context surfacing disabled');
        return {
          handler: 'PromptSubmitHandler',
          success: true,
          output: '',
        };
      }

      // Determine includeCommitMessages setting
      const includeCommitMessages = promptConfig.includeCommitMessages ?? true;

      // Try intent extraction if enabled
      let result: IMemoryContextResult;

      if (promptConfig.extractIntent && this.intentExtractor && event.prompt) {
        const intentResult = await this.intentExtractor.extract({ prompt: event.prompt });

        if (!intentResult.skipped && intentResult.intent) {
          this.logger?.debug('Intent extracted, querying with keywords', {
            intent: intentResult.intent,
          });
          result = this.memoryContextLoader.loadWithQuery(
            intentResult.intent,
            promptConfig.memoryLimit,
            event.cwd,
          );
        } else {
          this.logger?.debug('Intent extraction skipped', {
            reason: intentResult.reason,
          });
          // Fall back to loading recent memories
          result = this.memoryContextLoader.load({
            cwd: event.cwd,
            limit: promptConfig.memoryLimit,
            includeCommitMessages,
          });
        }
      } else {
        // No intent extraction, load recent memories
        result = this.memoryContextLoader.load({
          cwd: event.cwd,
          limit: promptConfig.memoryLimit,
          includeCommitMessages,
        });
      }

      if (result.memories.length === 0) {
        this.logger?.debug('No memories found for prompt context');
        return {
          handler: 'PromptSubmitHandler',
          success: true,
          output: '',
        };
      }

      const output = this.contextFormatter.format(result.memories, {
        commitMessages: result.commitMessages,
      });

      this.logger?.info('Memories loaded for prompt context', {
        total: result.total,
        filtered: result.filtered,
        hasCommitMessages: !!result.commitMessages,
      });

      return {
        handler: 'PromptSubmitHandler',
        success: true,
        output,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('Prompt submit handler failed', {
        error: err.message,
        stack: err.stack,
      });
      return {
        handler: 'PromptSubmitHandler',
        success: false,
        error: err,
      };
    }
  }
}

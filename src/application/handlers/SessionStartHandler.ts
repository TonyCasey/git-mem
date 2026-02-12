/**
 * SessionStartHandler
 *
 * Handles the session:start event by loading stored memories
 * and formatting them as markdown for Claude Code's context.
 */

import type { ISessionStartHandler } from '../interfaces/ISessionStartHandler';
import type { ISessionStartEvent } from '../../domain/events/HookEvents';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { IMemoryContextLoader } from '../../domain/interfaces/IMemoryContextLoader';
import type { IContextFormatter } from '../../domain/interfaces/IContextFormatter';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class SessionStartHandler implements ISessionStartHandler {
  constructor(
    private readonly memoryContextLoader: IMemoryContextLoader,
    private readonly contextFormatter: IContextFormatter,
    private readonly logger?: ILogger,
  ) {}

  async handle(event: ISessionStartEvent): Promise<IEventResult> {
    try {
      this.logger?.info('Session start handler invoked', {
        trigger: event.trigger,
        cwd: event.cwd,
      });

      const result = this.memoryContextLoader.load({ cwd: event.cwd });

      if (result.memories.length === 0) {
        this.logger?.debug('No memories found');
        return {
          handler: 'SessionStartHandler',
          success: true,
          output: '',
        };
      }

      const output = this.contextFormatter.format(
        result.memories as import('../../domain/entities/IMemoryEntity').IMemoryEntity[],
        {
          trigger: event.trigger,
          includeStats: true,
        },
      );

      this.logger?.info('Memories loaded for context', {
        total: result.total,
        filtered: result.filtered,
      });

      return {
        handler: 'SessionStartHandler',
        success: true,
        output,
      };
    } catch (error) {
      this.logger?.error('Session start handler failed', { error });
      return {
        handler: 'SessionStartHandler',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

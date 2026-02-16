/**
 * SessionStartHandler
 *
 * Handles the session:start event by loading stored memories
 * and formatting them as markdown for Claude Code's context.
 * Also activates runtime.json for cross-hook agent/model detection.
 */

import type { ISessionStartHandler } from '../interfaces/ISessionStartHandler';
import type { ISessionStartEvent } from '../../domain/events/HookEvents';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { IMemoryContextLoader } from '../../domain/interfaces/IMemoryContextLoader';
import type { IContextFormatter } from '../../domain/interfaces/IContextFormatter';
import type { ILogger } from '../../domain/interfaces/ILogger';
import type { IRuntimeService } from '../../domain/interfaces/IRuntimeService';
import type { IAgentResolver } from '../../domain/interfaces/IAgentResolver';

export class SessionStartHandler implements ISessionStartHandler {
  constructor(
    private readonly memoryContextLoader: IMemoryContextLoader,
    private readonly contextFormatter: IContextFormatter,
    private readonly logger?: ILogger,
    private readonly runtimeService?: IRuntimeService,
    private readonly agentResolver?: IAgentResolver,
  ) {}

  async handle(event: ISessionStartEvent): Promise<IEventResult> {
    try {
      this.logger?.info('Session start handler invoked', {
        trigger: event.trigger,
        cwd: event.cwd,
      });

      // Activate runtime.json for cross-hook agent/model detection
      this.activateRuntime(event);

      const result = this.memoryContextLoader.load({ cwd: event.cwd });

      if (result.memories.length === 0) {
        this.logger?.debug('No memories found');
        return {
          handler: 'SessionStartHandler',
          success: true,
          output: '',
        };
      }

      const output = this.contextFormatter.format(result.memories, {
        trigger: event.trigger,
        includeStats: true,
      });

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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('Session start handler failed', {
        error: err.message,
        stack: err.stack,
      });
      return {
        handler: 'SessionStartHandler',
        success: false,
        error: err,
      };
    }
  }

  /**
   * Activate runtime.json with current agent/model detection.
   * Never throws — activation errors are logged and ignored.
   */
  private activateRuntime(event: ISessionStartEvent): void {
    if (!this.runtimeService || !this.agentResolver) {
      return;
    }

    try {
      const agent = this.agentResolver.resolveAgent();
      const model = this.agentResolver.resolveModel();

      // Determine source based on which env var is set
      const source = this.detectSource();

      this.runtimeService.activate(
        {
          sessionId: event.sessionId,
          agent,
          model,
          timestamp: new Date().toISOString(),
          source,
        },
        event.cwd,
      );

      this.logger?.debug('Runtime activated', { agent, model, source });
    } catch (error) {
      // Never fail the handler due to runtime activation errors
      this.logger?.warn('Failed to activate runtime', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Determine the source of agent detection from environment variables.
   */
  private detectSource(): string {
    if (process.env.CLAUDECODE) return 'env:CLAUDECODE';
    if (process.env.CLAUDE_CODE) return 'env:CLAUDE_CODE';
    if (process.env.CODEX_THREAD_ID) return 'env:CODEX_THREAD_ID';
    if (process.env.GIT_MEM_AGENT) return 'env:GIT_MEM_AGENT';
    return 'env:unknown';
  }
}

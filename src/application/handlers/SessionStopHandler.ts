/**
 * SessionStopHandler
 *
 * Handles the session:stop event by capturing memories from
 * commits made during the session via SessionCaptureService.
 * Also deactivates runtime.json to prevent stale agent/model attribution.
 */

import type { ISessionStopHandler } from '../interfaces/ISessionStopHandler';
import type { ISessionStopEvent } from '../../domain/events/HookEvents';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { ISessionCaptureService } from '../../domain/interfaces/ISessionCaptureService';
import type { ILogger } from '../../domain/interfaces/ILogger';
import type { IRuntimeService } from '../../domain/interfaces/IRuntimeService';

export class SessionStopHandler implements ISessionStopHandler {
  constructor(
    private readonly sessionCaptureService: ISessionCaptureService,
    private readonly logger?: ILogger,
    private readonly runtimeService?: IRuntimeService,
  ) {}

  async handle(event: ISessionStopEvent): Promise<IEventResult> {
    try {
      this.logger?.info('Session stop handler invoked', {
        sessionId: event.sessionId,
        cwd: event.cwd,
      });

      const result = await this.sessionCaptureService.capture({
        sessionId: event.sessionId,
        cwd: event.cwd,
      });

      this.logger?.info('Session capture complete', {
        commitsScanned: result.commitsScanned,
        memoriesExtracted: result.memoriesExtracted,
      });

      // Deactivate runtime.json to prevent stale attribution
      this.deactivateRuntime(event.cwd);

      return {
        handler: 'SessionStopHandler',
        success: true,
        output: result.summary,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('Session stop handler failed', {
        error: err.message,
        stack: err.stack,
      });
      return {
        handler: 'SessionStopHandler',
        success: false,
        error: err,
      };
    }
  }

  /**
   * Deactivate runtime.json to prevent stale agent/model attribution.
   * Never throws — deactivation errors are logged and ignored.
   */
  private deactivateRuntime(cwd: string): void {
    if (!this.runtimeService) {
      return;
    }

    try {
      this.runtimeService.deactivate(cwd);
      this.logger?.debug('Runtime deactivated');
    } catch (error) {
      // Never fail the handler due to runtime deactivation errors
      this.logger?.warn('Failed to deactivate runtime', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

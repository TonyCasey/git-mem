/**
 * SessionStopHandler
 *
 * Handles the session:stop event by capturing memories from
 * commits made during the session via SessionCaptureService.
 */

import type { ISessionStopHandler } from '../interfaces/ISessionStopHandler';
import type { ISessionStopEvent } from '../../domain/events/HookEvents';
import type { IEventResult } from '../../domain/interfaces/IEventResult';
import type { ISessionCaptureService } from '../../domain/interfaces/ISessionCaptureService';
import type { ILogger } from '../../domain/interfaces/ILogger';

export class SessionStopHandler implements ISessionStopHandler {
  constructor(
    private readonly sessionCaptureService: ISessionCaptureService,
    private readonly logger?: ILogger,
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
}

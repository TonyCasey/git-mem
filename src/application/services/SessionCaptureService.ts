/**
 * SessionCaptureService
 *
 * Captures memories from commits made during a Claude Code session.
 * Delegates to LiberateService for triage, extraction, and writing.
 */

import type {
  ISessionCaptureService,
  ISessionCaptureOptions,
  ISessionCaptureResult,
} from '../../domain/interfaces/ISessionCaptureService';
import type { ILiberateService } from '../interfaces/ILiberateService';
import type { ILogger } from '../../domain/interfaces/ILogger';

/**
 * Scope capture to commits from the last 24 hours.
 *
 * Claude Code's session-stop payload does not include the session start
 * time, so we use a rolling 24h window as a pragmatic approximation.
 * LiberateService skips commits that already have notes, preventing
 * duplicate extraction across multiple sessions in a single day.
 */
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export class SessionCaptureService implements ISessionCaptureService {
  constructor(
    private readonly liberateService: ILiberateService,
    private readonly logger?: ILogger,
  ) {}

  async capture(options: ISessionCaptureOptions): Promise<ISessionCaptureResult> {
    const since = new Date(Date.now() - SESSION_WINDOW_MS);

    this.logger?.info('Capturing session memories', {
      sessionId: options.sessionId,
      since: since.toISOString(),
      cwd: options.cwd,
    });

    const result = await this.liberateService.liberate({
      since,
      enrich: false,
      dryRun: false,
      cwd: options.cwd,
    });

    const summary = result.factsExtracted > 0
      ? `Captured ${result.factsExtracted} memories from ${result.commitsScanned} commits.`
      : `Scanned ${result.commitsScanned} commits, no new memories.`;

    this.logger?.info('Session capture complete', {
      commitsScanned: result.commitsScanned,
      memoriesExtracted: result.factsExtracted,
    });

    return {
      commitsScanned: result.commitsScanned,
      memoriesExtracted: result.factsExtracted,
      summary,
    };
  }
}

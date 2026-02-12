/**
 * ISessionCaptureService
 *
 * Domain interface for capturing memories from commits made
 * during a Claude Code session. Used by the session-stop hook
 * to auto-extract knowledge before the session ends.
 */

export interface ISessionCaptureOptions {
  /** Session identifier. */
  readonly sessionId: string;
  /** Working directory for git operations. */
  readonly cwd?: string;
}

export interface ISessionCaptureResult {
  /** Number of commits scanned during capture. */
  readonly commitsScanned: number;
  /** Number of memories extracted from those commits. */
  readonly memoriesExtracted: number;
  /** Human-readable summary for stderr output. */
  readonly summary: string;
}

export interface ISessionCaptureService {
  /** Capture memories from recent commits in the session. */
  capture(options: ISessionCaptureOptions): Promise<ISessionCaptureResult>;
}

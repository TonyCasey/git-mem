/**
 * HookEvents
 *
 * Domain event types emitted by Claude Code hook entry points.
 * Handlers subscribe to these events via the IEventBus.
 */

/** Event emitted when a Claude Code session starts. */
export interface ISessionStartEvent {
  readonly type: 'session:start';
  readonly sessionId: string;
  /** How the session was triggered: 'startup' or 'resume'. */
  readonly trigger: string;
  /** Working directory of the session. */
  readonly cwd: string;
}

/** Event emitted when a Claude Code session stops. */
export interface ISessionStopEvent {
  readonly type: 'session:stop';
  readonly sessionId: string;
  /** Working directory of the session. */
  readonly cwd: string;
}

/** Event emitted when the user submits a prompt. */
export interface IPromptSubmitEvent {
  readonly type: 'prompt:submit';
  readonly sessionId: string;
  /** The user's prompt text. */
  readonly prompt: string;
  /** Working directory of the session. */
  readonly cwd: string;
}

/** Event emitted after a git commit is created. */
export interface IGitCommitEvent {
  readonly type: 'git:commit';
  /** The commit SHA. */
  readonly sha: string;
  /** Working directory of the repository. */
  readonly cwd: string;
}

/** Event emitted by commit-msg hook to analyze and add trailers. */
export interface ICommitMsgEvent {
  readonly type: 'git:commit-msg';
  /** Path to the commit message file. */
  readonly commitMsgPath: string;
  /** Working directory of the repository. */
  readonly cwd: string;
}

/** Union of all hook events. */
export type HookEvent =
  | ISessionStartEvent
  | ISessionStopEvent
  | IPromptSubmitEvent
  | IGitCommitEvent
  | ICommitMsgEvent;

/** String literal union of all hook event types. */
export type HookEventType = HookEvent['type'];

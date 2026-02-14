/**
 * IHookConfig
 *
 * Type definitions for .git-mem.json hook configuration.
 * Read by hook entry points to control per-hook behaviour.
 */

export interface ISessionStartConfig {
  readonly enabled: boolean;
  /** Max memories to load. Reserved — not yet wired to handler. */
  readonly memoryLimit: number;
  /** ISO date-range filter. Reserved — not yet wired to handler. */
  readonly dateRange?: string | null;
  /** Tag filter. Reserved — not yet wired to handler. */
  readonly tags?: string[] | null;
}

export interface ISessionStopConfig {
  readonly enabled: boolean;
  /** When false, session-stop hook exits without capturing. */
  readonly autoExtract: boolean;
  /** Interest score threshold for extract. Reserved — not yet wired to handler. */
  readonly threshold: number;
}

export interface IPromptSubmitConfig {
  readonly enabled: boolean;
  /** Whether to record prompts as memories. Reserved — not yet wired to handler. */
  readonly recordPrompts: boolean;
  /** Whether to surface context memories per prompt. Reserved — not yet wired to handler. */
  readonly surfaceContext: boolean;
}

export interface IPostCommitConfig {
  readonly enabled: boolean;
}

export interface IHooksConfig {
  readonly enabled: boolean;
  readonly sessionStart: ISessionStartConfig;
  readonly sessionStop: ISessionStopConfig;
  readonly promptSubmit: IPromptSubmitConfig;
  readonly postCommit: IPostCommitConfig;
}

export interface IHookConfig {
  readonly hooks: IHooksConfig;
}

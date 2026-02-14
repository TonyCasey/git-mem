/**
 * IHookConfig
 *
 * Type definitions for .git-mem/.git-mem.yaml hook configuration.
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

export interface ICommitMsgConfig {
  readonly enabled: boolean;
  /** Auto-analyze commit message and add AI trailers. */
  readonly autoAnalyze: boolean;
  /** Infer tags from file paths and scope. */
  readonly inferTags: boolean;
  /** Require a memory type to be detected (skip if none found). */
  readonly requireType: boolean;
  /** Default memory lifecycle. */
  readonly defaultLifecycle: 'permanent' | 'project' | 'session';
  /** Enable LLM enrichment for richer trailer content. Requires ANTHROPIC_API_KEY. */
  readonly enrich: boolean;
  /** Timeout in ms for LLM enrichment call. Default: 8000. Must be under hook timeout (10s). */
  readonly enrichTimeout: number;
}

export interface IHooksConfig {
  readonly enabled: boolean;
  readonly sessionStart: ISessionStartConfig;
  readonly sessionStop: ISessionStopConfig;
  readonly promptSubmit: IPromptSubmitConfig;
  readonly postCommit: IPostCommitConfig;
  readonly commitMsg: ICommitMsgConfig;
}

export interface IHookConfig {
  readonly hooks: IHooksConfig;
}

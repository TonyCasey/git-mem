/**
 * IHookConfig
 *
 * Type definitions for .git-mem.json hook configuration.
 * Read by hook entry points to control per-hook behaviour.
 */

export interface ISessionStartConfig {
  readonly enabled: boolean;
  readonly memoryLimit: number;
  readonly dateRange?: string | null;
  readonly tags?: string[] | null;
}

export interface ISessionStopConfig {
  readonly enabled: boolean;
  readonly autoLiberate: boolean;
  readonly threshold: number;
}

export interface IPromptSubmitConfig {
  readonly enabled: boolean;
  readonly recordPrompts: boolean;
  readonly surfaceContext: boolean;
}

export interface IHooksConfig {
  readonly enabled: boolean;
  readonly sessionStart: ISessionStartConfig;
  readonly sessionStop: ISessionStopConfig;
  readonly promptSubmit: IPromptSubmitConfig;
}

export interface IHookConfig {
  readonly hooks: IHooksConfig;
}

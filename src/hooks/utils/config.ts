/**
 * Hook configuration reader.
 *
 * Reads .git-mem.json from the working directory and returns
 * typed hook configuration with sensible defaults.
 * Never throws — returns defaults on missing file or parse errors.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { IHookConfig, IHooksConfig } from '../../domain/interfaces/IHookConfig';

const DEFAULTS: IHookConfig = {
  hooks: {
    enabled: true,
    sessionStart: { enabled: true, memoryLimit: 20 },
    sessionStop: { enabled: true, autoExtract: true, threshold: 3 },
    promptSubmit: { enabled: false, recordPrompts: false, surfaceContext: true },
    postCommit: { enabled: true },
    commitMsg: {
      enabled: true,
      autoAnalyze: true,
      inferTags: true,
      requireType: false,
      defaultLifecycle: 'project',
    },
  },
};

export function loadHookConfig(cwd?: string): IHookConfig {
  const dir = cwd ?? process.cwd();
  const configPath = join(dir, '.git-mem.json');

  if (!existsSync(configPath)) {
    return DEFAULTS;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const rawHooks = (raw.hooks ?? {}) as Partial<IHooksConfig>;

    const rawStop = (rawHooks.sessionStop ?? {}) as Record<string, unknown>;

    return {
      hooks: {
        enabled: rawHooks.enabled ?? DEFAULTS.hooks.enabled,
        sessionStart: {
          ...DEFAULTS.hooks.sessionStart,
          ...(rawHooks.sessionStart ?? {}),
        },
        sessionStop: {
          ...DEFAULTS.hooks.sessionStop,
          ...rawStop,
        },
        promptSubmit: {
          ...DEFAULTS.hooks.promptSubmit,
          ...(rawHooks.promptSubmit ?? {}),
        },
        postCommit: {
          ...DEFAULTS.hooks.postCommit,
          ...(rawHooks.postCommit ?? {}),
        },
        commitMsg: {
          ...DEFAULTS.hooks.commitMsg,
          ...(rawHooks.commitMsg ?? {}),
        },
      },
    };
  } catch {
    return DEFAULTS;
  }
}

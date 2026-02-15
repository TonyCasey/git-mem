/**
 * Hook configuration reader.
 *
 * Reads .git-mem/.git-mem.yaml from the working directory and returns
 * typed hook configuration with sensible defaults.
 * Never throws — returns defaults on missing file or parse errors.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { IHookConfig, IHooksConfig } from '../../domain/interfaces/IHookConfig';

/** Directory containing git-mem configuration */
export const CONFIG_DIR = '.git-mem';

/** Config file name */
export const CONFIG_FILE = '.git-mem.yaml';

/**
 * Get the full path to the config file.
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Absolute path to .git-mem/.git-mem.yaml
 */
export function getConfigPath(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  return join(dir, CONFIG_DIR, CONFIG_FILE);
}

/**
 * Get the path to the config directory.
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Absolute path to .git-mem/
 */
export function getConfigDir(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  return join(dir, CONFIG_DIR);
}

const DEFAULTS: IHookConfig = {
  hooks: {
    enabled: true,
    sessionStart: { enabled: true, memoryLimit: 20 },
    sessionStop: { enabled: true, autoExtract: true, threshold: 3 },
    promptSubmit: {
      enabled: true,
      recordPrompts: false,
      surfaceContext: true,
      extractIntent: true,
      intentTimeout: 3000,
      minWords: 5,
      memoryLimit: 20,
    },
    postCommit: { enabled: true },
    commitMsg: {
      enabled: true,
      autoAnalyze: true,
      inferTags: true,
      requireType: false,
      defaultLifecycle: 'project',
      enrich: true,
      enrichTimeout: 8000,
    },
  },
};

export function loadHookConfig(cwd?: string): IHookConfig {
  const configPath = getConfigPath(cwd);

  if (!existsSync(configPath)) {
    return DEFAULTS;
  }

  try {
    const raw = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
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

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

    // Backward compat: migrate autoLiberate → autoExtract
    const rawStop = (rawHooks.sessionStop ?? {}) as Record<string, unknown>;
    if (rawStop.autoExtract === undefined && rawStop.autoLiberate !== undefined) {
      rawStop.autoExtract = rawStop.autoLiberate;
      delete rawStop.autoLiberate;
    }

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
      },
    };
  } catch {
    return DEFAULTS;
  }
}

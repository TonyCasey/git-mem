/**
 * HookConfigLoader
 *
 * Infrastructure implementation of IHookConfigLoader.
 * Loads and merges hook configuration from .git-mem/.git-mem.yaml.
 */

import type { IHookConfigLoader } from '../../domain/interfaces/IHookConfigLoader';
import type { IHookConfig } from '../../domain/interfaces/IHookConfig';
import { loadHookConfig } from '../../hooks/utils/config';

/**
 * Implementation of IHookConfigLoader that reads from .git-mem/.git-mem.yaml.
 * Returns defaults on missing file or parse errors (never throws).
 */
export class HookConfigLoader implements IHookConfigLoader {
  loadConfig(cwd: string): IHookConfig {
    return loadHookConfig(cwd);
  }
}

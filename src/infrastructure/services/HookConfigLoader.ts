/**
 * HookConfigLoader
 *
 * Infrastructure implementation of IHookConfigLoader.
 * Loads and merges hook configuration from .git-mem.json.
 */

import type { IHookConfigLoader } from '../../domain/interfaces/IHookConfigLoader';
import type { IHookConfig } from '../../domain/interfaces/IHookConfig';
import { loadHookConfig } from '../../hooks/utils/config';

/**
 * Implementation of IHookConfigLoader that reads from .git-mem.json.
 */
export class HookConfigLoader implements IHookConfigLoader {
  loadConfig(cwd: string): IHookConfig {
    return loadHookConfig(cwd);
  }
}

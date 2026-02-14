/**
 * IHookConfigLoader
 *
 * Domain interface for loading hook configuration.
 * Implementation lives in infrastructure/hooks layer.
 */

import type { IHookConfig } from './IHookConfig';

/**
 * Loads hook configuration for a repository.
 */
export interface IHookConfigLoader {
  /**
   * Load the git-mem configuration for a repository.
   * @param cwd - Working directory of the repository
   * @returns Merged configuration with defaults
   */
  loadConfig(cwd: string): IHookConfig;
}

/**
 * AgentResolver
 *
 * Infrastructure implementation of IAgentResolver.
 * Detects AI agent and model from environment variables,
 * with fallback to runtime.json for cross-hook persistence.
 */

import type { IAgentResolver } from '../../domain/interfaces/IAgentResolver';
import type { IRuntimeService, IRuntimeData } from '../../domain/interfaces/IRuntimeService';
import { resolveAgent, resolveModel } from '../detect-agent';

/**
 * Implementation of IAgentResolver using environment variable detection,
 * with optional runtime.json fallback for hooks running outside AI sessions.
 * Caches runtime.json read to avoid multiple file system operations.
 */
export class AgentResolver implements IAgentResolver {
  /** Cached runtime data to avoid repeated file reads. */
  private cachedRuntimeData: IRuntimeData | undefined | null = null;

  constructor(
    private readonly runtimeService?: IRuntimeService,
    private readonly cwd?: string,
  ) {}

  resolveAgent(): string | undefined {
    // Try environment detection first
    const envAgent = resolveAgent();
    if (envAgent) {
      return envAgent;
    }

    // Fall back to runtime.json if available (cached)
    return this.getRuntimeData()?.agent;
  }

  resolveModel(): string | undefined {
    // Try environment detection first
    const envModel = resolveModel();
    if (envModel) {
      return envModel;
    }

    // Fall back to runtime.json if available (cached)
    return this.getRuntimeData()?.model;
  }

  /**
   * Get cached runtime data, reading from file only once per instance.
   */
  private getRuntimeData(): IRuntimeData | undefined {
    // null = not yet read, undefined = read but no data
    if (this.cachedRuntimeData === null) {
      this.cachedRuntimeData = this.runtimeService?.read(this.cwd);
    }
    return this.cachedRuntimeData;
  }
}

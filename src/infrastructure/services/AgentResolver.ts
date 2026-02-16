/**
 * AgentResolver
 *
 * Infrastructure implementation of IAgentResolver.
 * Detects AI agent and model from environment variables,
 * with fallback to runtime.json for cross-hook persistence.
 */

import type { IAgentResolver } from '../../domain/interfaces/IAgentResolver';
import type { IRuntimeService } from '../../domain/interfaces/IRuntimeService';
import { resolveAgent, resolveModel } from '../detect-agent';

/**
 * Implementation of IAgentResolver using environment variable detection,
 * with optional runtime.json fallback for hooks running outside AI sessions.
 */
export class AgentResolver implements IAgentResolver {
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

    // Fall back to runtime.json if available
    return this.runtimeService?.read(this.cwd)?.agent;
  }

  resolveModel(): string | undefined {
    // Try environment detection first
    const envModel = resolveModel();
    if (envModel) {
      return envModel;
    }

    // Fall back to runtime.json if available
    return this.runtimeService?.read(this.cwd)?.model;
  }
}

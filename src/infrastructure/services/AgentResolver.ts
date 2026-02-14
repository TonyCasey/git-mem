/**
 * AgentResolver
 *
 * Infrastructure implementation of IAgentResolver.
 * Detects AI agent and model from environment variables.
 */

import type { IAgentResolver } from '../../domain/interfaces/IAgentResolver';
import { resolveAgent, resolveModel } from '../detect-agent';

/**
 * Implementation of IAgentResolver using environment variable detection.
 */
export class AgentResolver implements IAgentResolver {
  resolveAgent(): string | undefined {
    return resolveAgent();
  }

  resolveModel(): string | undefined {
    return resolveModel();
  }
}

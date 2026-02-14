/**
 * IAgentResolver
 *
 * Domain interface for resolving AI agent and model identifiers.
 * Implementation lives in infrastructure layer.
 */

/**
 * Resolves the current AI agent identifier.
 */
export interface IAgentResolver {
  /**
   * Get the agent identifier from environment or config.
   * @returns Agent string (e.g., "Claude-Code/1.0") or undefined if not detected.
   */
  resolveAgent(): string | undefined;

  /**
   * Get the model identifier from environment or config.
   * @returns Model string (e.g., "claude-opus-4-5-20251101") or undefined if not detected.
   */
  resolveModel(): string | undefined;
}

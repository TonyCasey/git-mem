/**
 * Detect AI agent and model from environment variables.
 *
 * Agent detection chain: $GIT_MEM_AGENT > $CLAUDECODE (with version) > $CLAUDE_CODE
 * Model detection chain: $GIT_MEM_MODEL > $ANTHROPIC_MODEL
 */

import { execFileSync } from 'child_process';

/**
 * Detect Claude Code agent string including version.
 * Returns e.g. "Claude-Code/2.1.41" or "Claude-Code" if version unavailable.
 */
export function detectClaudeAgent(): string {
  try {
    // Unset CLAUDECODE so `claude --version` doesn't refuse to run inside a session
    const version = execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDECODE: '' },
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split(/\s+/)[0];
    if (version) return `Claude-Code/${version}`;
  } catch {
    // claude binary not found or timed out — fall back
  }
  return 'Claude-Code';
}

/**
 * Resolve the AI agent string from env vars.
 * @param explicit Optional explicit value (from CLI flag or MCP param)
 */
export function resolveAgent(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (process.env.GIT_MEM_AGENT) return process.env.GIT_MEM_AGENT;
  if (process.env.CLAUDECODE) return detectClaudeAgent();
  if (process.env.CLAUDE_CODE) return 'Claude-Code';
  return undefined;
}

/**
 * Resolve the AI model string from env vars.
 * @param explicit Optional explicit value (from CLI flag or MCP param)
 */
export function resolveModel(explicit?: string): string | undefined {
  if (explicit) return explicit;
  return process.env.GIT_MEM_MODEL || process.env.ANTHROPIC_MODEL || undefined;
}

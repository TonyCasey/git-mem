/**
 * Detect AI agent and model from environment variables and config files.
 *
 * Agent detection chain:
 *   explicit > $GIT_MEM_AGENT > $CODEX_THREAD_ID > $CLAUDECODE > $CLAUDE_CODE
 * Model detection chain:
 *   explicit > $GIT_MEM_MODEL >
 *   (if $CODEX_THREAD_ID) Codex config.toml >
 *   (if $CLAUDECODE|$CLAUDE_CODE) Claude session JSONL >
 *   $ANTHROPIC_MODEL > $CLAUDE_MODEL > $OPENAI_MODEL > $GEMINI_MODEL > $OLLAMA_MODEL > $MODEL
 */

import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Detect Codex agent string including version.
 * Returns e.g. "Codex/0.101.0" or "Codex" if version unavailable.
 */
function detectCodexAgent(): string {
  try {
    const output = execFileSync('codex', ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const versionMatch = output.match(/\d+\.\d+\.\d+(?:[-+._0-9A-Za-z]*)?/);
    if (versionMatch) return `Codex/${versionMatch[0]}`;
  } catch {
    // codex binary not found or timed out
  }
  return 'Codex';
}

/**
 * Detect Claude Code agent string including version.
 * Returns e.g. "Claude-Code/2.1.42" or "Claude-Code" if version unavailable.
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
 * Read model from Codex config.toml (e.g. model = "gpt-5.3-codex").
 */
function detectCodexModel(): string | undefined {
  try {
    const home = process.env.CODEX_HOME
      || (process.env.USERPROFILE && join(process.env.USERPROFILE, '.codex'))
      || (process.env.HOME && join(process.env.HOME, '.codex'));
    if (!home) return undefined;
    const content = readFileSync(join(home, 'config.toml'), 'utf8');
    const match = content.match(/^model\s*=\s*"([^"]+)"/m);
    return match?.[1] || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read model from the most recent Claude Code session JSONL for the current project.
 * Searches for the last "model" field in the newest session file.
 */
function detectClaudeModel(): string | undefined {
  try {
    const claudeDir = process.env.USERPROFILE
      ? join(process.env.USERPROFILE, '.claude')
      : process.env.HOME
        ? join(process.env.HOME, '.claude')
        : undefined;
    if (!claudeDir) return undefined;

    // Claude Code encodes cwd as the projects subdirectory name
    const cwdEncoded = process.cwd().replace(/[:\\/]/g, '-').replace(/^-/, '');
    const projectDir = join(claudeDir, 'projects', cwdEncoded);

    // Find most recent .jsonl session file
    const files = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        try {
          return { name: f, mtime: statSync(join(projectDir, f)).mtimeMs };
        } catch {
          return { name: f, mtime: 0 };
        }
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return undefined;

    const content = readFileSync(join(projectDir, files[0].name), 'utf8');
    // Find the last occurrence of "model":"..." in the file
    // Find the last occurrence of "model":"..." without allocating all matches
    const modelRegex = /"model"\s*:\s*"([^"]+)"/g;
    let lastModel: string | undefined;
    let m: RegExpExecArray | null;
    while ((m = modelRegex.exec(content)) !== null) {
      lastModel = m[1];
    }
    return lastModel;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the AI agent string from env vars.
 * @param explicit Optional explicit value (from CLI flag or MCP param)
 */
export function resolveAgent(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (process.env.GIT_MEM_AGENT) return process.env.GIT_MEM_AGENT;
  if (process.env.CODEX_THREAD_ID) return detectCodexAgent();
  if (process.env.CLAUDECODE) return detectClaudeAgent();
  if (process.env.CLAUDE_CODE) return 'Claude-Code';
  return undefined;
}

/**
 * Resolve the AI model string from env vars and config files.
 * @param explicit Optional explicit value (from CLI flag or MCP param)
 */
export function resolveModel(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (process.env.GIT_MEM_MODEL) return process.env.GIT_MEM_MODEL;

  // Try config-file-based detection for active agent sessions
  if (process.env.CODEX_THREAD_ID) {
    const codexModel = detectCodexModel();
    if (codexModel) return codexModel;
  }

  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) {
    const claudeModel = detectClaudeModel();
    if (claudeModel) return claudeModel;
  }

  // Fall back to well-known provider env vars
  return (
    process.env.ANTHROPIC_MODEL ||
    process.env.CLAUDE_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.GEMINI_MODEL ||
    process.env.OLLAMA_MODEL ||
    process.env.MODEL ||
    undefined
  );
}

/**
 * Resolve the git repository root directory.
 *
 * Uses `git rev-parse --show-toplevel` and normalizes the path with
 * path.resolve() for cross-platform compatibility (Windows returns
 * forward-slash paths from git).
 *
 * @param cwd - Optional working directory to resolve from
 * @returns Absolute path to the repo root, or fallback on failure
 */

import { execFileSync } from 'child_process';
import { resolve } from 'path';

/**
 * Resolve git root, returning null on failure.
 * Use this when the caller needs to handle the missing-repo case explicitly.
 */
export function getGitRoot(cwd?: string): string | null {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return resolve(root);
  } catch {
    return null;
  }
}

/**
 * Resolve git root, falling back to process.cwd() on failure.
 * Use this when a directory is always needed (e.g. init commands).
 */
export function resolveGitRoot(cwd?: string): string {
  return getGitRoot(cwd) ?? process.cwd();
}

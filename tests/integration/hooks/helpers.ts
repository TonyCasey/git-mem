/**
 * Shared helpers for hook integration tests.
 *
 * Provides child-process wrappers to invoke `git-mem hook <event>`
 * and `git-mem init-hooks` against real temp git repos.
 */

import { spawnSync, execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { stringify as stringifyYaml } from 'yaml';
import { CONFIG_DIR, CONFIG_FILE } from '../../../src/hooks/utils/config';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const CLI_PATH = resolve(PROJECT_ROOT, 'src/cli.ts');

// Use tsx binary from project node_modules — works even when cwd is a temp dir
const TSX_BIN = resolve(PROJECT_ROOT, 'node_modules/.bin/tsx');

export interface IRunResult {
  stdout: string;
  stderr: string;
  status: number;
}

/** Run `git-mem hook <eventName>` with JSON piped to stdin. */
export function runHook(eventName: string, input: Record<string, unknown>): IRunResult {
  const result = spawnSync(TSX_BIN, [CLI_PATH, 'hook', eventName], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 15_000,
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

/** Run `git-mem <args>` as a child process. */
export function runCli(args: string[], opts?: { cwd?: string; input?: string }): IRunResult {
  const result = spawnSync(TSX_BIN, [CLI_PATH, ...args], {
    input: opts?.input,
    cwd: opts?.cwd,
    encoding: 'utf8',
    timeout: 15_000,
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

/** Helper to run git commands. */
export function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

/** Create a temp git repo with an initial commit. Returns dir and HEAD sha. */
export function createTestRepo(prefix = 'git-mem-hook-integ-'): { dir: string; sha: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix));

  git(['init'], dir);
  git(['config', 'user.email', 'test@test.com'], dir);
  git(['config', 'user.name', 'Test User'], dir);

  writeFileSync(join(dir, 'file.txt'), 'initial content');
  git(['add', '.'], dir);
  git(['commit', '-m', 'feat: initial commit'], dir);
  const sha = git(['rev-parse', 'HEAD'], dir);

  return { dir, sha };
}

/** Add a commit to an existing test repo. Returns the new sha. */
export function addCommit(dir: string, filename: string, content: string, message: string): string {
  writeFileSync(join(dir, filename), content);
  git(['add', '.'], dir);
  git(['commit', '-m', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

/** Write .git-mem/.git-mem.yaml into a directory with optional per-hook overrides. */
export function writeGitMemConfig(
  dir: string,
  overrides?: Partial<Record<'enabled' | 'sessionStart' | 'sessionStop' | 'promptSubmit' | 'postCommit', unknown>>,
): void {
  const defaults = {
    hooks: {
      enabled: true,
      sessionStart: { enabled: true, memoryLimit: 20 },
      sessionStop: { enabled: true, autoExtract: true, threshold: 3 },
      promptSubmit: { enabled: false, recordPrompts: false, surfaceContext: true },
      postCommit: { enabled: true },
    },
  };

  const configDir = join(dir, CONFIG_DIR);
  mkdirSync(configDir, { recursive: true });

  if (!overrides) {
    writeFileSync(join(configDir, CONFIG_FILE), stringifyYaml(defaults));
    return;
  }

  const merged = {
    hooks: {
      enabled: overrides.enabled ?? defaults.hooks.enabled,
      sessionStart: { ...defaults.hooks.sessionStart, ...(overrides.sessionStart as object) },
      sessionStop: { ...defaults.hooks.sessionStop, ...(overrides.sessionStop as object) },
      promptSubmit: { ...defaults.hooks.promptSubmit, ...(overrides.promptSubmit as object) },
      postCommit: { ...defaults.hooks.postCommit, ...(overrides.postCommit as object) },
    },
  };
  writeFileSync(join(configDir, CONFIG_FILE), stringifyYaml(merged));
}

/** Remove a temp directory. */
export function cleanupRepo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

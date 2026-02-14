/**
 * post-commit git hook
 *
 * Installs/uninstalls a git hook that writes session metadata as a git note
 * when an AI-assisted session is detected.
 *
 * The hook pipes the commit SHA to `git-mem hook post-commit`, which dispatches
 * to the PostCommitHandler via the EventBus.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

/** Prefix used to detect any version of our hook. */
const HOOK_FINGERPRINT_PREFIX = '# git-mem:post-commit';

/** Full fingerprint with version — used for upgrade detection. */
const HOOK_FINGERPRINT = `${HOOK_FINGERPRINT_PREFIX} v1`;

/**
 * The shell hook script.
 * Pipes the commit SHA as JSON to git-mem hook post-commit.
 */
const HOOK_SCRIPT = `#!/bin/sh
${HOOK_FINGERPRINT}
# Writes session metadata as a git note when an AI-assisted session is detected.

# Get the commit SHA
SHA=$(git rev-parse HEAD)

# Pipe JSON to git-mem hook handler
echo "{\\"sha\\":\\"$SHA\\"}" | git-mem hook post-commit 2>/dev/null || true
`;

/**
 * Find the .git directory for the repository at cwd.
 * Handles worktrees where .git is a file pointing to the real git dir.
 */
function findGitDir(cwd: string): string {
  try {
    const gitDir = execFileSync(
      'git', ['rev-parse', '--git-dir'],
      { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    // git rev-parse may return a relative path — resolve it against cwd
    return resolve(cwd, gitDir);
  } catch {
    return join(cwd, '.git');
  }
}

/**
 * Check if an existing hook file was installed by git-mem (any version).
 */
function isGitMemHook(hookPath: string): boolean {
  if (!existsSync(hookPath)) return false;
  const content = readFileSync(hookPath, 'utf8');
  return content.includes(HOOK_FINGERPRINT_PREFIX);
}

/**
 * Check if an installed hook is the current version.
 */
function isCurrentVersion(hookPath: string): boolean {
  if (!existsSync(hookPath)) return false;
  const content = readFileSync(hookPath, 'utf8');
  return content.includes(HOOK_FINGERPRINT);
}

export interface IHookInstallResult {
  /** Whether the hook was installed (false if already present). */
  readonly installed: boolean;
  /** Whether an existing user hook was wrapped. */
  readonly wrapped: boolean;
  /** Path to the installed hook. */
  readonly hookPath: string;
}

/**
 * Install the post-commit hook.
 * Idempotent: re-running is safe.
 * Wraps existing non-git-mem hooks by renaming them to .user-backup.
 * Upgrades outdated git-mem hooks in-place.
 */
export function installPostCommitHook(cwd?: string): IHookInstallResult {
  const gitDir = findGitDir(cwd || process.cwd());
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'post-commit');
  const backupPath = join(hooksDir, 'post-commit.user-backup');

  // Already installed and up-to-date — idempotent
  if (isGitMemHook(hookPath) && isCurrentVersion(hookPath)) {
    return { installed: false, wrapped: false, hookPath };
  }

  // Outdated git-mem hook — upgrade in-place
  if (isGitMemHook(hookPath) && !isCurrentVersion(hookPath)) {
    writeFileSync(hookPath, HOOK_SCRIPT);
    chmodSync(hookPath, 0o755);
    return { installed: true, wrapped: false, hookPath };
  }

  let wrapped = false;

  // Existing non-git-mem hook — wrap it
  if (existsSync(hookPath)) {
    // Guard: don't overwrite an existing backup from a failed previous install
    if (existsSync(backupPath)) {
      throw new Error(
        `Backup hook already exists at ${backupPath}. ` +
        'Remove it manually or run --uninstall-hooks first.',
      );
    }
    renameSync(hookPath, backupPath);
    wrapped = true;

    // Create a wrapper that calls the user's hook first, then ours.
    // Uses a path relative to the hook's directory so it survives repo moves.
    const wrapperScript = HOOK_SCRIPT.replace(
      '#!/bin/sh',
      '#!/bin/sh\n# Wrapped existing hook — original saved as post-commit.user-backup\n' +
      'BACKUP_HOOK="$(dirname "$0")/post-commit.user-backup"\n' +
      'if [ -x "$BACKUP_HOOK" ]; then\n  "$BACKUP_HOOK" "$@" || exit $?\nfi',
    );
    writeFileSync(hookPath, wrapperScript);
  } else {
    writeFileSync(hookPath, HOOK_SCRIPT);
  }

  chmodSync(hookPath, 0o755);
  return { installed: true, wrapped, hookPath };
}

/**
 * Uninstall the post-commit hook.
 * Restores wrapped user hooks if a backup exists.
 */
export function uninstallPostCommitHook(cwd?: string): boolean {
  const gitDir = findGitDir(cwd || process.cwd());
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'post-commit');
  const backupPath = join(hooksDir, 'post-commit.user-backup');

  if (!isGitMemHook(hookPath)) {
    return false;
  }

  unlinkSync(hookPath);

  // Restore user's original hook if it was wrapped
  if (existsSync(backupPath)) {
    renameSync(backupPath, hookPath);
  }

  return true;
}

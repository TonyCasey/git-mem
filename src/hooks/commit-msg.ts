/**
 * commit-msg git hook
 *
 * Installs/uninstalls a git hook that analyzes commit messages
 * and adds AI-* trailers (Decision, Gotcha, Convention, Confidence, Tags, etc.)
 * based on heuristic pattern matching and conventional commit parsing.
 *
 * This hook runs after the commit message is finalized, allowing it to
 * analyze the complete message and add appropriate trailers.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

/** Prefix used to detect any version of our hook. */
const HOOK_FINGERPRINT_PREFIX = '# git-mem:commit-msg';

/** Full fingerprint with version — used for upgrade detection. */
const HOOK_FINGERPRINT = `${HOOK_FINGERPRINT_PREFIX} v3`;

/**
 * The shell hook script.
 * Passes the commit message file path to git-mem hook commit-msg.
 */
const HOOK_SCRIPT = `#!/bin/sh
${HOOK_FINGERPRINT}
# Analyzes commit message and adds AI-* trailers for memory tracking.

COMMIT_MSG_FILE="$1"

# Skip if no commit message file
[ -z "$COMMIT_MSG_FILE" ] && exit 0

# Skip if full analysis already done (AI-Memory-Id indicates commit-msg hook has run)
grep -q "^AI-Memory-Id:" "$COMMIT_MSG_FILE" && exit 0

# Escape values for safe JSON inclusion (handles quotes, backslashes)
COMMIT_MSG_FILE_ESC=$(printf '%s' "$COMMIT_MSG_FILE" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
CWD_ESC=$(pwd | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')

# Run git-mem commit-msg analyzer
# Pass commit message file path via JSON stdin
echo "{\\"commit_msg_path\\": \\"$COMMIT_MSG_FILE_ESC\\", \\"cwd\\": \\"$CWD_ESC\\"}" | \\
  git-mem hook commit-msg 2>/dev/null || true

exit 0
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
 * Install the commit-msg hook.
 * Idempotent: re-running is safe.
 * Wraps existing non-git-mem hooks by renaming them to .user-backup.
 * Upgrades outdated git-mem hooks in-place.
 */
export function installCommitMsgHook(cwd?: string): IHookInstallResult {
  const gitDir = findGitDir(cwd || process.cwd());
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'commit-msg');
  const backupPath = join(hooksDir, 'commit-msg.user-backup');

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
    const wrapperScript = HOOK_SCRIPT.replace(
      '#!/bin/sh',
      '#!/bin/sh\n# Wrapped existing hook — original saved as commit-msg.user-backup\n' +
      'BACKUP_HOOK="$(dirname "$0")/commit-msg.user-backup"\n' +
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
 * Uninstall the commit-msg hook.
 * Restores wrapped user hooks if a backup exists.
 */
export function uninstallCommitMsgHook(cwd?: string): boolean {
  const gitDir = findGitDir(cwd || process.cwd());
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'commit-msg');
  const backupPath = join(hooksDir, 'commit-msg.user-backup');

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

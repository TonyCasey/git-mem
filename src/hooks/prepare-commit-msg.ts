/**
 * prepare-commit-msg git hook
 *
 * Installs/uninstalls a git hook that injects AI-Agent and AI-Model
 * trailers into commit messages when an AI-assisted session is detected.
 *
 * Detection heuristics (checked in order):
 *   - $GIT_MEM_AGENT env var (explicit, user-defined agent string)
 *   - $CLAUDE_CODE env var (Claude Code session)
 *   - $GIT_MEM_MODEL env var (explicit, user-defined model string)
 *
 * The hook uses `git interpret-trailers` for proper formatting.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

/** Prefix used to detect any version of our hook. */
const HOOK_FINGERPRINT_PREFIX = '# git-mem:prepare-commit-msg';

/** Full fingerprint with version — used for upgrade detection. */
const HOOK_FINGERPRINT = `${HOOK_FINGERPRINT_PREFIX} v2`;

/**
 * The shell hook script.
 * Uses `git interpret-trailers` for correct trailer formatting.
 */
const HOOK_SCRIPT = `#!/bin/sh
${HOOK_FINGERPRINT}
# Injects AI-Agent and AI-Model trailers when an AI-assisted session is detected.

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Skip merge/squash commits (git does not pass "amend" as a commit source)
case "$COMMIT_SOURCE" in
  merge|squash) exit 0 ;;
esac

# Detect AI agent
AGENT=""
if [ -n "$GIT_MEM_AGENT" ]; then
  AGENT="$GIT_MEM_AGENT"
elif [ -n "$CLAUDE_CODE" ]; then
  AGENT="Claude-Code"
fi

# Detect AI model
MODEL=""
if [ -n "$GIT_MEM_MODEL" ]; then
  MODEL="$GIT_MEM_MODEL"
fi

# No agent detected — exit silently
[ -z "$AGENT" ] && exit 0

# Skip if AI-Agent trailer already present
grep -q "^AI-Agent:" "$COMMIT_MSG_FILE" && exit 0

# Append agent trailer using git's built-in formatter
git interpret-trailers --in-place --trailer "AI-Agent: $AGENT" "$COMMIT_MSG_FILE"

# Append model trailer if detected
if [ -n "$MODEL" ]; then
  grep -q "^AI-Model:" "$COMMIT_MSG_FILE" ||
    git interpret-trailers --in-place --trailer "AI-Model: $MODEL" "$COMMIT_MSG_FILE"
fi
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
 * Install the prepare-commit-msg hook.
 * Idempotent: re-running is safe.
 * Wraps existing non-git-mem hooks by renaming them to .user-backup.
 * Upgrades outdated git-mem hooks in-place.
 */
export function installHook(cwd?: string): IHookInstallResult {
  const gitDir = findGitDir(cwd || process.cwd());
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'prepare-commit-msg');
  const backupPath = join(hooksDir, 'prepare-commit-msg.user-backup');

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
      '#!/bin/sh\n# Wrapped existing hook — original saved as prepare-commit-msg.user-backup\n' +
      'BACKUP_HOOK="$(dirname "$0")/prepare-commit-msg.user-backup"\n' +
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
 * Uninstall the prepare-commit-msg hook.
 * Restores wrapped user hooks if a backup exists.
 */
export function uninstallHook(cwd?: string): boolean {
  const gitDir = findGitDir(cwd || process.cwd());
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'prepare-commit-msg');
  const backupPath = join(hooksDir, 'prepare-commit-msg.user-backup');

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

/**
 * prepare-commit-msg git hook
 *
 * Installs/uninstalls a git hook that injects AI-Agent trailers
 * into commit messages when an AI-assisted session is detected.
 *
 * Detection heuristics (checked in order):
 *   - $GIT_MEM_AGENT env var (explicit, user-defined agent string)
 *   - $CLAUDE_CODE env var (Claude Code session)
 *
 * The hook uses `git interpret-trailers` for proper formatting.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

/** Fingerprint comment used to detect our hook. */
const HOOK_FINGERPRINT = '# git-mem:prepare-commit-msg v1';

/**
 * The shell hook script.
 * Uses `git interpret-trailers` for correct trailer formatting.
 */
const HOOK_SCRIPT = `#!/bin/sh
${HOOK_FINGERPRINT}
# Injects AI-Agent trailer when an AI-assisted session is detected.

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Skip merge/squash/amend commits
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

# No agent detected — exit silently
[ -z "$AGENT" ] && exit 0

# Skip if AI-Agent trailer already present
grep -q "^AI-Agent:" "$COMMIT_MSG_FILE" && exit 0

# Append trailer using git's built-in formatter
git interpret-trailers --in-place --trailer "AI-Agent: $AGENT" "$COMMIT_MSG_FILE"
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
 * Check if an existing hook file was installed by git-mem.
 */
function isGitMemHook(hookPath: string): boolean {
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
 */
export function installHook(cwd?: string): IHookInstallResult {
  const gitDir = findGitDir(cwd || process.cwd());
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'prepare-commit-msg');
  const backupPath = join(hooksDir, 'prepare-commit-msg.user-backup');

  // Already installed — idempotent
  if (isGitMemHook(hookPath)) {
    return { installed: false, wrapped: false, hookPath };
  }

  let wrapped = false;

  // Existing non-git-mem hook — wrap it
  if (existsSync(hookPath)) {
    renameSync(hookPath, backupPath);
    wrapped = true;

    // Create a wrapper that calls the user's hook first, then ours
    const wrapperScript = HOOK_SCRIPT.replace(
      '#!/bin/sh',
      `#!/bin/sh\n# Wrapped existing hook — original saved as prepare-commit-msg.user-backup\nif [ -x "${backupPath}" ]; then\n  "${backupPath}" "$@" || exit $?\nfi`,
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

/**
 * Integration test: commit-msg hook
 *
 * Exercises `git-mem hook commit-msg` end-to-end against a real
 * git repo. Verifies AI-* trailers are added to commit messages
 * based on pattern analysis and conventional commit parsing.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  runHook,
  createTestRepo,
  writeGitMemConfig,
  cleanupRepo,
  git,
} from './helpers';

/**
 * Write a commit-msg config to .git-mem.json.
 * Extends the default config with commitMsg settings.
 */
function writeCommitMsgConfig(
  dir: string,
  commitMsgOverrides?: {
    enabled?: boolean;
    autoAnalyze?: boolean;
    inferTags?: boolean;
    requireType?: boolean;
    defaultLifecycle?: string;
  },
): void {
  const config = {
    hooks: {
      enabled: true,
      sessionStart: { enabled: true, memoryLimit: 20 },
      sessionStop: { enabled: true, autoExtract: true, threshold: 3 },
      promptSubmit: { enabled: false, recordPrompts: false, surfaceContext: true },
      postCommit: { enabled: true },
      commitMsg: {
        enabled: true,
        autoAnalyze: true,
        inferTags: true,
        requireType: false,
        defaultLifecycle: 'project',
        ...commitMsgOverrides,
      },
    },
  };
  writeFileSync(join(dir, '.git-mem.json'), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Create a commit message file in the repo's .git directory.
 */
function createCommitMsgFile(dir: string, message: string): string {
  const msgPath = join(dir, '.git', 'COMMIT_EDITMSG');
  writeFileSync(msgPath, message);
  return msgPath;
}

describe('Integration: hook commit-msg', () => {
  let repoDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  before(() => {
    const repo = createTestRepo('git-mem-hook-commit-msg-');
    repoDir = repo.dir;
    writeCommitMsgConfig(repoDir);
  });

  after(() => {
    cleanupRepo(repoDir);
  });

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Remove keys that were added during the test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    // Restore original values
    Object.assign(process.env, originalEnv);
  });

  describe('basic trailer addition', () => {
    it('should add AI-Agent and AI-Model trailers', () => {
      // Set env vars for agent detection
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';
      process.env.GIT_MEM_MODEL = 'test-model-integration';

      const commitMsg = 'feat: add user authentication';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0, `Hook should exit 0, stderr: ${result.stderr}`);

      // Read the modified commit message
      const modifiedMsg = readFileSync(msgPath, 'utf8');

      // Verify AI-Agent and AI-Model trailers
      assert.ok(modifiedMsg.includes('AI-Agent: TestAgent/2.0'), 'Should have AI-Agent trailer');
      assert.ok(modifiedMsg.includes('AI-Model: test-model-integration'), 'Should have AI-Model trailer');
    });

    it('should add AI-Confidence trailer', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'fix: handle null response';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(
        modifiedMsg.includes('AI-Confidence: ') &&
        (modifiedMsg.includes('high') || modifiedMsg.includes('medium') || modifiedMsg.includes('low')),
        'Should have AI-Confidence trailer',
      );
    });

    it('should add AI-Lifecycle trailer from config', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'chore: update dependencies';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Lifecycle: project'), 'Should have AI-Lifecycle trailer');
    });

    it('should add AI-Memory-Id trailer', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'docs: update README';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      // Memory ID is first 8 chars of UUID
      assert.match(modifiedMsg, /AI-Memory-Id: [a-f0-9]{8}/, 'Should have AI-Memory-Id trailer');
    });
  });

  describe('memory type detection', () => {
    it('should detect decision from "because" clause', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'feat(auth): implement JWT authentication\n\nUsing JWT because it scales better than sessions.';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Decision:'), 'Should detect decision from "because" clause');
    });

    it('should detect gotcha from "gotcha" keyword', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'fix(api): handle edge case\n\nGotcha: the API returns null instead of empty array.';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Gotcha:'), 'Should detect gotcha from keyword');
    });

    it('should detect convention from pattern', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'refactor(style): standardize naming\n\nConvention: all interfaces should be prefixed with I.';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Convention:'), 'Should detect convention from keyword');
    });
  });

  describe('tag inference', () => {
    it('should infer tags from conventional commit scope', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      // Stage a file to enable tag inference from paths
      writeFileSync(join(repoDir, 'auth.ts'), 'export const auth = {};');
      git(['add', 'auth.ts'], repoDir);

      const commitMsg = 'feat(auth): add login endpoint';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Tags:'), 'Should have AI-Tags trailer');
      assert.ok(modifiedMsg.includes('auth'), 'Should include scope as tag');

      // Clean up staged file
      git(['reset', 'HEAD', 'auth.ts'], repoDir);
    });

    it('should infer tags from staged file paths', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      // Create a directory structure and stage files
      mkdirSync(join(repoDir, 'src', 'api'), { recursive: true });
      writeFileSync(join(repoDir, 'src', 'api', 'users.ts'), 'export const users = {};');
      git(['add', 'src/api/users.ts'], repoDir);

      const commitMsg = 'feat: add user API';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Tags:'), 'Should have AI-Tags trailer');
      assert.ok(modifiedMsg.includes('api'), 'Should include path component as tag');

      // Clean up staged file
      git(['reset', 'HEAD', 'src/api/users.ts'], repoDir);
    });
  });

  describe('skip conditions', () => {
    it('should skip if AI-Memory-Id trailer already exists (full analysis done)', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'feat: something\n\nAI-Memory-Id: abc12345';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      // Message should be unchanged - no new trailers added
      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should not add trailers when already analyzed');
      assert.ok(modifiedMsg.includes('AI-Memory-Id: abc12345'), 'Should preserve existing trailers');
    });

    it('should exit successfully without changes when no agent detected', () => {
      // Clear all agent env vars
      delete process.env.GIT_MEM_AGENT;
      delete process.env.GIT_MEM_MODEL;
      delete process.env.CLAUDECODE;
      delete process.env.CLAUDE_CODE;
      delete process.env.ANTHROPIC_MODEL;

      const commitMsg = 'feat: no agent commit';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      // No AI-Agent trailer should be added
      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should not add trailers without agent');
    });
  });

  describe('config options', () => {
    it('should respect autoAnalyze=false and only add Agent/Model', () => {
      const configRepo = createTestRepo('git-mem-commit-msg-config-');

      try {
        writeCommitMsgConfig(configRepo.dir, { autoAnalyze: false });
        process.env.GIT_MEM_AGENT = 'TestAgent/2.0';
        process.env.GIT_MEM_MODEL = 'test-model';

        const commitMsg = 'feat(auth): add JWT because it scales better';
        const msgPath = createCommitMsgFile(configRepo.dir, commitMsg);

        const result = runHook('commit-msg', {
          commit_msg_path: msgPath,
          cwd: configRepo.dir,
        });

        assert.equal(result.status, 0);

        const modifiedMsg = readFileSync(msgPath, 'utf8');
        assert.ok(modifiedMsg.includes('AI-Agent:'), 'Should add AI-Agent');
        assert.ok(modifiedMsg.includes('AI-Model:'), 'Should add AI-Model');
        assert.ok(!modifiedMsg.includes('AI-Decision:'), 'Should NOT analyze for decisions');
        assert.ok(!modifiedMsg.includes('AI-Tags:'), 'Should NOT infer tags');
      } finally {
        cleanupRepo(configRepo.dir);
      }
    });

    it('should respect inferTags=false', () => {
      const configRepo = createTestRepo('git-mem-commit-msg-tags-');

      try {
        writeCommitMsgConfig(configRepo.dir, { inferTags: false });
        process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

        // Stage a file that would normally contribute to tags
        mkdirSync(join(configRepo.dir, 'src', 'api'), { recursive: true });
        writeFileSync(join(configRepo.dir, 'src', 'api', 'test.ts'), 'export const x = 1;');
        git(['add', '.'], configRepo.dir);

        const commitMsg = 'feat(auth): add feature';
        const msgPath = createCommitMsgFile(configRepo.dir, commitMsg);

        const result = runHook('commit-msg', {
          commit_msg_path: msgPath,
          cwd: configRepo.dir,
        });

        assert.equal(result.status, 0);

        const modifiedMsg = readFileSync(msgPath, 'utf8');
        assert.ok(!modifiedMsg.includes('AI-Tags:'), 'Should NOT add tags when inferTags=false');
      } finally {
        cleanupRepo(configRepo.dir);
      }
    });

    it('should respect requireType=true and skip when no type detected', () => {
      const configRepo = createTestRepo('git-mem-commit-msg-require-');

      try {
        writeCommitMsgConfig(configRepo.dir, { requireType: true });
        process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

        // A message that is NOT a conventional commit and has no heuristic patterns.
        // This will not match any conventional commit type or pattern.
        const commitMsg = 'WIP';
        const msgPath = createCommitMsgFile(configRepo.dir, commitMsg);

        const result = runHook('commit-msg', {
          commit_msg_path: msgPath,
          cwd: configRepo.dir,
        });

        assert.equal(result.status, 0);

        // Should not add any trailers because no type was detected
        const modifiedMsg = readFileSync(msgPath, 'utf8');
        assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should skip all trailers when requireType=true and no type');
      } finally {
        cleanupRepo(configRepo.dir);
      }
    });

    it('should use custom defaultLifecycle', () => {
      const configRepo = createTestRepo('git-mem-commit-msg-lifecycle-');

      try {
        writeCommitMsgConfig(configRepo.dir, { defaultLifecycle: 'permanent' });
        process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

        const commitMsg = 'feat: important feature';
        const msgPath = createCommitMsgFile(configRepo.dir, commitMsg);

        const result = runHook('commit-msg', {
          commit_msg_path: msgPath,
          cwd: configRepo.dir,
        });

        assert.equal(result.status, 0);

        const modifiedMsg = readFileSync(msgPath, 'utf8');
        assert.ok(modifiedMsg.includes('AI-Lifecycle: permanent'), 'Should use custom lifecycle');
      } finally {
        cleanupRepo(configRepo.dir);
      }
    });
  });

  describe('Claude Code environment detection', () => {
    it('should detect Claude Code agent from CLAUDECODE env var', () => {
      delete process.env.GIT_MEM_AGENT;
      process.env.CLAUDECODE = '1';
      process.env.ANTHROPIC_MODEL = 'claude-opus-4-5-20251101';

      const commitMsg = 'feat: claude code commit';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Agent:'), 'Should detect agent');
      assert.ok(
        modifiedMsg.includes('Claude-Code') || modifiedMsg.includes('claude-code'),
        'Agent should be Claude Code variant',
      );
      assert.ok(modifiedMsg.includes('AI-Model: claude-opus-4-5-20251101'), 'Should use ANTHROPIC_MODEL');
    });
  });

  describe('edge cases', () => {
    it('should handle empty commit message', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = '';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      // Should not crash
      assert.equal(result.status, 0);
    });

    it('should handle commit message with only whitespace', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = '   \n\n   ';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      // Should not crash
      assert.equal(result.status, 0);
    });

    it('should handle commit message with special characters', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'feat: handle "special" chars & symbols <> \\ / $VAR';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      // Original message should still be there
      assert.ok(modifiedMsg.includes('special'), 'Should preserve original message');
      assert.ok(modifiedMsg.includes('AI-Agent:'), 'Should add trailers');
    });

    it('should handle multiline commit message', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = `feat(api): add new endpoint

This commit adds a new API endpoint for user management.
The endpoint supports:
- GET /users
- POST /users
- DELETE /users/:id

Because REST conventions make the API predictable.`;

      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Agent:'), 'Should add trailers');
      assert.ok(modifiedMsg.includes('AI-Decision:'), 'Should detect decision from "because"');
    });

    it('should skip merge commit message', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = `Merge branch 'feature/auth' into main

# Conflicts:
#	src/auth.ts`;

      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      // Should NOT add trailers to merge commits
      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should skip merge commits');
    });

    it('should skip merge pull request commit', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = `Merge pull request #123 from feature/auth

Add authentication feature`;

      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should skip merge PR commits');
    });

    it('should skip fixup! commits', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'fixup! feat: original commit';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should skip fixup commits');
    });

    it('should skip squash! commits', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'squash! feat: original commit';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should skip squash commits');
    });

    it('should skip amend! commits', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'amend! feat: original commit';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should skip amend! commits');
    });

    it('should skip revert commits', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = `Revert "feat: add problematic feature"

This reverts commit abc1234.`;

      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(!modifiedMsg.includes('AI-Agent:'), 'Should skip revert commits');
    });

    it('should handle regular amend (git commit --amend)', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      // Regular amend - message doesn't start with "amend!"
      // Just modifying a previous commit message
      const commitMsg = `feat: original feature (amended)

Updated the implementation details.`;

      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      // Regular amends should still get trailers
      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Agent:'), 'Should add trailers to regular amended commit');
    });

    it('should handle unicode and emoji in commit message', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      const commitMsg = 'feat: add 日本語 support 🎉\n\nThis adds internationalization because users need 多言語 support.';
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('🎉'), 'Should preserve emoji');
      assert.ok(modifiedMsg.includes('日本語'), 'Should preserve unicode');
      assert.ok(modifiedMsg.includes('AI-Agent:'), 'Should add trailers');
    });

    it('should handle very long commit message', () => {
      process.env.GIT_MEM_AGENT = 'TestAgent/2.0';

      // Create a long commit message (> 1000 chars)
      const longBody = 'This is a detailed explanation. '.repeat(50);
      const commitMsg = `feat: add comprehensive feature\n\n${longBody}\n\nBecause this decision will help with scaling.`;
      const msgPath = createCommitMsgFile(repoDir, commitMsg);

      const result = runHook('commit-msg', {
        commit_msg_path: msgPath,
        cwd: repoDir,
      });

      assert.equal(result.status, 0);

      const modifiedMsg = readFileSync(msgPath, 'utf8');
      assert.ok(modifiedMsg.includes('AI-Agent:'), 'Should handle long messages');
      // Content should be truncated in trailers (200 char limit in buildTrailers)
      const decisionMatch = modifiedMsg.match(/AI-Decision: (.+)/);
      if (decisionMatch) {
        assert.ok(decisionMatch[1].length <= 200, 'Trailer content should be truncated to 200 chars');
      }
    });
  });
});

/**
 * CommitMsgHandler unit tests
 *
 * Tests the commit-msg hook handler including LLM enrichment
 * and fallback to heuristic analysis.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { CommitMsgHandler } from '../../../../src/application/handlers/CommitMsgHandler';
import type { ICommitMsgEvent } from '../../../../src/domain/events/HookEvents';
import type { ICommitAnalyzer, ICommitAnalysis } from '../../../../src/application/interfaces/ICommitAnalyzer';
import type { IGitClient } from '../../../../src/domain/interfaces/IGitClient';
import type { ILogger } from '../../../../src/domain/interfaces/ILogger';
import type { IAgentResolver } from '../../../../src/domain/interfaces/IAgentResolver';
import type { IHookConfigLoader } from '../../../../src/domain/interfaces/IHookConfigLoader';
import type { IHookConfig } from '../../../../src/domain/interfaces/IHookConfig';
import type { ILLMClient, ILLMEnrichmentResult, ILLMExtractedFact } from '../../../../src/domain/interfaces/ILLMClient';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createEvent(overrides?: Partial<ICommitMsgEvent>): ICommitMsgEvent {
  return {
    type: 'git:commit-msg',
    commitMsgPath: '/tmp/COMMIT_EDITMSG',
    cwd: '/tmp/test-repo',
    ...overrides,
  };
}

function createMockAnalysis(overrides?: Partial<ICommitAnalysis>): ICommitAnalysis {
  return {
    type: 'decision',
    content: 'Use JWT for auth',
    confidence: 'high',
    tags: ['auth'],
    conventionalType: 'feat',
    scope: 'auth',
    patternName: 'because-clause',
    ...overrides,
  };
}

function createMockCommitAnalyzer(analysis?: Partial<ICommitAnalysis>): ICommitAnalyzer {
  return {
    analyze: () => createMockAnalysis(analysis),
    parseConventionalCommit: () => ({
      type: 'feat',
      scope: null,
      breaking: false,
      description: 'test',
      body: '',
    }),
  };
}

function createMockGitClient(): IGitClient {
  return {
    diffStagedNames: () => ['src/auth.ts'],
    diffStaged: () => 'diff --git a/src/auth.ts\n+const jwt = require("jsonwebtoken");',
    log: () => [],
    getCommitDiff: () => '',
    show: () => '',
    revParse: () => 'abc123',
    isInsideWorkTree: () => true,
    getRoot: () => '/tmp/test-repo',
  };
}

function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => createMockLogger(),
    isLevelEnabled: () => true,
  };
}

function createMockAgentResolver(): IAgentResolver {
  return {
    resolveAgent: () => 'Claude-Code/1.0',
    resolveModel: () => 'claude-sonnet-4-20250514',
  };
}

function createMockConfigLoader(config?: Partial<IHookConfig['hooks']['commitMsg']>): IHookConfigLoader {
  return {
    loadConfig: () => ({
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
          enrich: true,
          enrichTimeout: 5000,
          ...config,
        },
      },
    }),
  };
}

function createMockLLMClient(
  result?: Partial<ILLMEnrichmentResult> | 'error' | 'timeout',
): ILLMClient {
  return {
    enrichCommit: async () => {
      if (result === 'error') {
        throw new Error('LLM API error');
      }
      if (result === 'timeout') {
        // Simulate a very slow response (will be raced against timeout)
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return { facts: [], usage: { inputTokens: 0, outputTokens: 0 } };
      }
      return {
        facts: [
          {
            content: 'Using JWT for stateless authentication',
            type: 'decision',
            confidence: 'high',
            tags: ['auth', 'jwt'],
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
        ...result,
      } as ILLMEnrichmentResult;
    },
  };
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

let testDir: string;

function setupTestRepo(): string {
  testDir = mkdtempSync(join(tmpdir(), 'git-mem-test-'));
  execSync('git init', { cwd: testDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: testDir, stdio: 'pipe' });
  return testDir;
}

function cleanupTestRepo(): void {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CommitMsgHandler', () => {
  describe('handle - basic behavior', () => {
    it('should return success when processing commit message', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: false }),
          null,
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        assert.equal(result.handler, 'CommitMsgHandler');
      } finally {
        cleanupTestRepo();
      }
    });

    it('should skip if AI-Memory-Id already present', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n\nAI-Memory-Id: abc123\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: false }),
          null,
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        // Message should be unchanged
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(!content.includes('AI-Source:'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should skip merge commits', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'Merge branch "feature" into main\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: false }),
          null,
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(!content.includes('AI-Memory-Id:'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should add AI-Source: heuristic when using heuristic analysis', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: false }),
          null, // No LLM client
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: heuristic'));
      } finally {
        cleanupTestRepo();
      }
    });
  });

  describe('handle - LLM enrichment', () => {
    it('should use LLM enrichment when enabled and client available', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add JWT auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true }),
          createMockLLMClient(),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: llm-enrichment'));
        assert.ok(content.includes('AI-Decision:'));
        assert.ok(content.includes('JWT'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should fall back to heuristic when enrich is disabled', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: false }),
          createMockLLMClient(),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: heuristic'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should fall back to heuristic when LLM client is null', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true }),
          null, // No LLM client
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: heuristic'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should fall back to heuristic when LLM returns empty facts', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true }),
          createMockLLMClient({ facts: [] }),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: heuristic'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should fall back to heuristic when LLM throws error', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true }),
          createMockLLMClient('error'),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: heuristic'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should fall back to heuristic when LLM times out', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true, enrichTimeout: 50 }), // Very short timeout
          createMockLLMClient('timeout'),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: heuristic'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should not include tags when inferTags is false', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      const facts: ILLMExtractedFact[] = [
        { content: 'Using JWT', type: 'decision', confidence: 'high', tags: ['auth', 'jwt'] },
      ];

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true, inferTags: false }),
          createMockLLMClient({ facts }),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        assert.ok(content.includes('AI-Source: llm-enrichment'));
        assert.ok(!content.includes('AI-Tags:')); // Tags should NOT be present
      } finally {
        cleanupTestRepo();
      }
    });

    it('should merge tags from all LLM facts', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      const facts: ILLMExtractedFact[] = [
        { content: 'Using JWT', type: 'decision', confidence: 'high', tags: ['auth', 'jwt'] },
        { content: 'Watch for expiry', type: 'gotcha', confidence: 'medium', tags: ['security', 'jwt'] },
      ];

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true }),
          createMockLLMClient({ facts }),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        // Should have merged tags from both facts
        assert.ok(content.includes('AI-Tags:'));
        assert.ok(content.includes('auth'));
        assert.ok(content.includes('jwt'));
        assert.ok(content.includes('security'));
      } finally {
        cleanupTestRepo();
      }
    });
  });

  describe('selectBestFact - priority logic', () => {
    it('should prefer decision over gotcha', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      const facts: ILLMExtractedFact[] = [
        { content: 'Watch for expiry', type: 'gotcha', confidence: 'high', tags: [] },
        { content: 'Using JWT for auth', type: 'decision', confidence: 'high', tags: [] },
      ];

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true }),
          createMockLLMClient({ facts }),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        // Decision trailer should be present (not Gotcha)
        assert.ok(content.includes('AI-Decision:'));
        assert.ok(content.includes('JWT'));
      } finally {
        cleanupTestRepo();
      }
    });

    it('should prefer higher confidence within same type', async () => {
      const dir = setupTestRepo();
      const msgPath = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgPath, 'feat: add auth\n');

      const facts: ILLMExtractedFact[] = [
        { content: 'Maybe use sessions', type: 'decision', confidence: 'low', tags: [] },
        { content: 'Use JWT for stateless auth', type: 'decision', confidence: 'high', tags: [] },
      ];

      try {
        const handler = new CommitMsgHandler(
          createMockCommitAnalyzer(),
          createMockGitClient(),
          createMockLogger(),
          createMockAgentResolver(),
          createMockConfigLoader({ enrich: true }),
          createMockLLMClient({ facts }),
        );

        const result = await handler.handle(createEvent({ commitMsgPath: msgPath, cwd: dir }));

        assert.equal(result.success, true);
        const content = readFileSync(msgPath, 'utf8');
        // Should use the high-confidence decision
        assert.ok(content.includes('AI-Confidence: high'));
        assert.ok(content.includes('stateless'));
      } finally {
        cleanupTestRepo();
      }
    });
  });
});

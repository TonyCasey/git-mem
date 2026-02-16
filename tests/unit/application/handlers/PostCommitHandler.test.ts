/**
 * PostCommitHandler unit tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PostCommitHandler } from '../../../../src/application/handlers/PostCommitHandler';
import type { INotesService } from '../../../../src/domain/interfaces/INotesService';
import type { ILogger } from '../../../../src/domain/interfaces/ILogger';
import type { IGitCommitEvent } from '../../../../src/domain/events/HookEvents';

function createEvent(overrides?: Partial<IGitCommitEvent>): IGitCommitEvent {
  return {
    type: 'git:commit',
    sha: 'abc123',
    cwd: '/tmp/test-repo',
    ...overrides,
  };
}

function createMockNotesService(readResult?: string | null): INotesService & { writeCalls: Array<{ sha: string; content: string; ref?: string; cwd?: string }> } {
  const writeCalls: Array<{ sha: string; content: string; ref?: string; cwd?: string }> = [];
  return {
    writeCalls,
    read: () => readResult ?? null,
    write: (sha: string, content: string, ref?: string, cwd?: string) => {
      writeCalls.push({ sha, content, ref, cwd });
    },
  };
}

function createMockLogger(): ILogger & { logs: Array<{ level: string; msg: string; data?: unknown }> } {
  const logs: Array<{ level: string; msg: string; data?: unknown }> = [];
  return {
    logs,
    child: (_bindings: Record<string, unknown>) => createMockLogger(),
    trace: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'trace', msg: message, data: context }),
    debug: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'debug', msg: message, data: context }),
    info: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'info', msg: message, data: context }),
    warn: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'warn', msg: message, data: context }),
    error: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'error', msg: message, data: context }),
    fatal: (message: string, context?: Record<string, unknown>) => logs.push({ level: 'fatal', msg: message, data: context }),
    isLevelEnabled: () => true,
  };
}

describe('PostCommitHandler', () => {
  // Save and restore env vars around tests
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.CODEX_HOME;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.CODEX_MODEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('when agent is detected', () => {
    beforeEach(() => {
      process.env.GIT_MEM_AGENT = 'TestAgent/1.0';
      process.env.GIT_MEM_MODEL = 'test-model-1';
    });

    it('should write session note with agent and model', async () => {
      const notesService = createMockNotesService(null);
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent({ sha: 'def456' }));

      assert.equal(result.success, true);
      assert.equal(result.handler, 'PostCommitHandler');
      assert.equal(notesService.writeCalls.length, 1);

      const written = notesService.writeCalls[0];
      assert.equal(written.sha, 'def456');
      assert.equal(written.cwd, '/tmp/test-repo');

      const payload = JSON.parse(written.content);
      assert.equal(payload.session.agent, 'TestAgent/1.0');
      assert.equal(payload.session.model, 'test-model-1');
      assert.ok(payload.session.timestamp, 'should have timestamp');
    });

    it('should preserve existing memories when adding session', async () => {
      const existingPayload = JSON.stringify({
        memories: [
          { id: 'mem-1', content: 'Existing memory', type: 'fact' },
          { id: 'mem-2', content: 'Another memory', type: 'decision' },
        ],
      });
      const notesService = createMockNotesService(existingPayload);
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(notesService.writeCalls.length, 1);

      const payload = JSON.parse(notesService.writeCalls[0].content);
      assert.equal(payload.memories.length, 2);
      assert.equal(payload.memories[0].id, 'mem-1');
      assert.equal(payload.memories[1].id, 'mem-2');
      assert.ok(payload.session.agent);
    });

    it('should update existing session field', async () => {
      const existingPayload = JSON.stringify({
        session: {
          agent: 'OldAgent/0.1',
          model: 'old-model',
          timestamp: '2020-01-01T00:00:00Z',
        },
      });
      const notesService = createMockNotesService(existingPayload);
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      const payload = JSON.parse(notesService.writeCalls[0].content);
      assert.equal(payload.session.agent, 'TestAgent/1.0');
      assert.equal(payload.session.model, 'test-model-1');
      assert.notEqual(payload.session.timestamp, '2020-01-01T00:00:00Z');
    });

    it('should pass cwd to notes service', async () => {
      const notesService = createMockNotesService(null);
      const handler = new PostCommitHandler(notesService);

      await handler.handle(createEvent({ cwd: '/custom/repo/path' }));

      assert.equal(notesService.writeCalls[0].cwd, '/custom/repo/path');
    });

    it('should log success when logger provided', async () => {
      const notesService = createMockNotesService(null);
      const logger = createMockLogger();
      const handler = new PostCommitHandler(notesService, logger);

      await handler.handle(createEvent({ sha: 'xyz789' }));

      const infoLogs = logger.logs.filter((l) => l.level === 'info');
      assert.ok(infoLogs.length >= 1);
      assert.ok(infoLogs.some((l) => l.msg.includes('Post-commit handler invoked')));
    });
  });

  describe('when no agent is detected', () => {
    beforeEach(() => {
      delete process.env.GIT_MEM_AGENT;
      delete process.env.CLAUDECODE;
      delete process.env.CLAUDE_CODE;
    });

    it('should return success without writing note', async () => {
      const notesService = createMockNotesService(null);
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(result.handler, 'PostCommitHandler');
      assert.equal(notesService.writeCalls.length, 0, 'should not write any notes');
    });

    it('should log debug message when logger provided', async () => {
      const notesService = createMockNotesService(null);
      const logger = createMockLogger();
      const handler = new PostCommitHandler(notesService, logger);

      await handler.handle(createEvent());

      const debugLogs = logger.logs.filter((l) => l.level === 'debug');
      assert.ok(debugLogs.some((l) => l.msg.includes('No AI agent detected')));
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      process.env.GIT_MEM_AGENT = 'TestAgent/1.0';
    });

    it('should return failure when notes service read throws', async () => {
      const notesService: INotesService = {
        read: () => { throw new Error('read failed'); },
        write: () => {},
      };
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, false);
      assert.equal(result.handler, 'PostCommitHandler');
      assert.ok(result.error instanceof Error);
      assert.equal(result.error!.message, 'read failed');
    });

    it('should return failure when notes service write throws', async () => {
      const notesService: INotesService = {
        read: () => null,
        write: () => { throw new Error('write failed'); },
      };
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, false);
      assert.ok(result.error instanceof Error);
      assert.equal(result.error!.message, 'write failed');
    });

    it('should handle non-Error throws', async () => {
      const notesService: INotesService = {
        read: () => { throw 'string error'; },
        write: () => {},
      };
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, false);
      assert.ok(result.error instanceof Error);
      assert.equal(result.error!.message, 'string error');
    });

    it('should log error when logger provided', async () => {
      const notesService: INotesService = {
        read: () => { throw new Error('oops'); },
        write: () => {},
      };
      const logger = createMockLogger();
      const handler = new PostCommitHandler(notesService, logger);

      await handler.handle(createEvent());

      const errorLogs = logger.logs.filter((l) => l.level === 'error');
      assert.ok(errorLogs.some((l) => l.msg.includes('Post-commit handler failed')));
    });

    it('should handle malformed JSON in existing note', async () => {
      const notesService = createMockNotesService('not valid json {{{');
      const logger = createMockLogger();
      const handler = new PostCommitHandler(notesService, logger);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(notesService.writeCalls.length, 1);

      // Should have logged warning about malformed JSON
      const warnLogs = logger.logs.filter((l) => l.level === 'warn');
      assert.ok(warnLogs.some((l) => l.msg.includes('Malformed note JSON')));

      // Should write fresh payload with just session
      const payload = JSON.parse(notesService.writeCalls[0].content);
      assert.ok(payload.session);
      assert.ok(!payload.memories, 'should not have memories from malformed JSON');
    });
  });

  describe('CLAUDECODE env var detection', () => {
    beforeEach(() => {
      delete process.env.GIT_MEM_AGENT;
      delete process.env.GIT_MEM_MODEL;
    });

    it('should detect agent from CLAUDECODE env var', async () => {
      process.env.CLAUDECODE = '1';
      const notesService = createMockNotesService(null);
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      assert.equal(notesService.writeCalls.length, 1);

      const payload = JSON.parse(notesService.writeCalls[0].content);
      assert.ok(payload.session.agent.includes('Claude-Code'));
    });

    it('should detect model from ANTHROPIC_MODEL env var', async () => {
      process.env.CLAUDECODE = '1';
      process.env.ANTHROPIC_MODEL = 'claude-opus-4-6';
      const notesService = createMockNotesService(null);
      const handler = new PostCommitHandler(notesService);

      const result = await handler.handle(createEvent());

      assert.equal(result.success, true);
      const payload = JSON.parse(notesService.writeCalls[0].content);
      assert.equal(payload.session.model, 'claude-opus-4-6');
    });
  });
});

/**
 * DI Container unit tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { createContainer } from '../../../../src/infrastructure/di';
import type { ILogger } from '../../../../src/domain/interfaces/ILogger';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

describe('createContainer', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-di-test-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);
    writeFileSync(join(repoDir, 'file.txt'), 'content');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'initial'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe('service resolution', () => {
    it('should resolve all core services', () => {
      const container = createContainer();
      const cradle = container.cradle;

      assert.ok(cradle.logger);
      assert.ok(cradle.notesService);
      assert.ok(cradle.gitClient);
      assert.ok(cradle.memoryRepository);
      assert.ok(cradle.trailerService);
      assert.ok(cradle.eventBus);
      assert.ok(cradle.triageService);
      assert.ok(cradle.memoryService);
      assert.ok(cradle.contextService);
      assert.ok(cradle.liberateService);
      assert.ok(cradle.sessionCaptureService);
      assert.ok(cradle.memoryContextLoader);
      assert.ok(cradle.contextFormatter);
    });

    it('should return singletons within container scope', () => {
      const container = createContainer();

      const logger1 = container.cradle.logger;
      const logger2 = container.cradle.logger;
      assert.equal(logger1, logger2);

      const memSvc1 = container.cradle.memoryService;
      const memSvc2 = container.cradle.memoryService;
      assert.equal(memSvc1, memSvc2);
    });
  });

  describe('logger options', () => {
    it('should create a logger when none provided', () => {
      const container = createContainer();
      assert.ok(container.cradle.logger);
    });

    it('should use provided logger', () => {
      const calls: string[] = [];
      const mockLogger: ILogger = {
        info: () => { calls.push('info'); },
        warn: () => { calls.push('warn'); },
        error: () => { calls.push('error'); },
        debug: () => { calls.push('debug'); },
        trace: () => { calls.push('trace'); },
        fatal: () => { calls.push('fatal'); },
        child: () => mockLogger,
        isLevelEnabled: () => true,
      };

      const container = createContainer({ logger: mockLogger });
      // Without a scope, the base logger is used directly
      container.cradle.logger.info('test');
      assert.ok(calls.includes('info'));
    });

    it('should create child logger with scope', () => {
      let childBindings: Record<string, unknown> | undefined;
      const mockLogger: ILogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        fatal: () => {},
        child: (bindings) => {
          childBindings = bindings;
          return mockLogger;
        },
        isLevelEnabled: () => true,
      };

      const container = createContainer({ logger: mockLogger, scope: 'remember' });
      // Access logger to trigger lazy resolution
      container.cradle.logger;
      assert.ok(childBindings);
      assert.equal(childBindings!.component, 'remember');
    });
  });

  describe('llmClient option', () => {
    it('should return null when enrich is false', () => {
      const container = createContainer({ enrich: false });
      assert.equal(container.cradle.llmClient, null);
    });

    it('should return null when enrich is not specified', () => {
      const container = createContainer();
      assert.equal(container.cradle.llmClient, null);
    });

    it('should attempt to create LLM client when enrich is true', () => {
      // Without ANTHROPIC_API_KEY, createLLMClient() returns null
      const container = createContainer({ enrich: true });
      // Should still be null since no API key is set in test env
      assert.equal(container.cradle.llmClient, null);
    });
  });

  describe('eventBus', () => {
    it('should resolve an event bus instance', () => {
      const container = createContainer();
      const bus = container.cradle.eventBus;

      assert.ok(bus);
      assert.ok(typeof bus.on === 'function');
      assert.ok(typeof bus.emit === 'function');
      assert.ok(typeof bus.registeredEvents === 'function');
    });

    it('should have session:start handler registered', () => {
      const container = createContainer();
      const events = container.cradle.eventBus.registeredEvents();
      assert.ok(events.includes('session:start'));
    });

    it('should have session:stop handler registered', () => {
      const container = createContainer();
      const events = container.cradle.eventBus.registeredEvents();
      assert.ok(events.includes('session:stop'));
    });

    it('should have prompt:submit handler registered', () => {
      const container = createContainer();
      const events = container.cradle.eventBus.registeredEvents();
      assert.ok(events.includes('prompt:submit'));
    });
  });

  describe('trailerService', () => {
    it('should resolve with expected interface', () => {
      const container = createContainer();
      const { trailerService } = container.cradle;

      assert.equal(typeof trailerService.readTrailers, 'function');
      assert.equal(typeof trailerService.formatTrailers, 'function');
      assert.equal(typeof trailerService.queryTrailers, 'function');
    });

    it('should return singleton within container scope', () => {
      const container = createContainer();
      assert.equal(container.cradle.trailerService, container.cradle.trailerService);
    });
  });

  describe('hook services', () => {
    it('should resolve hook services with expected interfaces', () => {
      const container = createContainer();
      const { memoryContextLoader, contextFormatter, sessionCaptureService } = container.cradle;

      assert.equal(typeof memoryContextLoader.load, 'function');
      assert.equal(typeof contextFormatter.format, 'function');
      assert.equal(typeof sessionCaptureService.capture, 'function');
    });
  });

  describe('service wiring', () => {
    it('should wire memoryService to use correct repository', () => {
      const container = createContainer();
      const { memoryService } = container.cradle;

      // Verify the service works end-to-end by calling remember
      const memory = memoryService.remember('test memory', {
        cwd: repoDir,
        type: 'fact',
      });

      assert.ok(memory.id);
      assert.equal(memory.content, 'test memory');
      assert.equal(memory.type, 'fact');
    });
  });
});

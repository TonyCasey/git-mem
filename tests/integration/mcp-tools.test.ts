/**
 * Integration test: MCP remember + recall tools
 *
 * Tests the MCP tools end-to-end by spawning the server as a subprocess
 * and sending JSON-RPC requests through stdio.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { mcpSession, git, createTestRepo, cleanupRepo } from './mcp/helpers';

describe('Integration: MCP Tools — remember + recall', () => {
  let repoDir: string;

  before(() => {
    const repo = createTestRepo('git-mem-mcp-tools-');
    repoDir = repo.dir;
    writeFileSync(join(repoDir, 'app.ts'), 'console.log("hello");');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add app'], repoDir);
  });

  after(() => {
    cleanupRepo(repoDir);
  });

  it('should store a memory via git_mem_remember', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/call',
      params: {
        name: 'git_mem_remember',
        arguments: {
          text: 'Use JWT for stateless auth',
          type: 'decision',
          tags: 'auth,security',
        },
      },
    }]);

    // responses[0] = initialize, responses[1] = remember result
    const result = responses[1] as any;
    assert.ok(result.result, 'Should have result');
    assert.ok(!result.result.isError, 'Should not be an error');

    const content = JSON.parse(result.result.content[0].text);
    assert.equal(content.status, 'stored');
    assert.ok(content.id, 'Should have memory ID');
    assert.equal(content.content, 'Use JWT for stateless auth');
    assert.equal(content.type, 'decision');
    assert.deepEqual(content.tags, ['auth', 'security']);
  });

  it('should recall memories via git_mem_recall', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/call',
      params: {
        name: 'git_mem_recall',
        arguments: {
          query: 'JWT',
        },
      },
    }]);

    const result = responses[1] as any;
    assert.ok(result.result, 'Should have result');

    const content = JSON.parse(result.result.content[0].text);
    assert.equal(content.total, 1);
    assert.equal(content.memories[0].content, 'Use JWT for stateless auth');
    assert.equal(content.memories[0].type, 'decision');
  });

  it('should return empty for non-matching recall', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/call',
      params: {
        name: 'git_mem_recall',
        arguments: {
          query: 'nonexistent-xyz-123',
        },
      },
    }]);

    const result = responses[1] as any;
    assert.equal(result.result.content[0].text, 'No memories found.');
  });

  it('should list tools including remember and recall', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/list',
      params: {},
    }]);

    const result = responses[1] as any;
    const toolNames = result.result.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('git_mem_remember'), 'Should list remember tool');
    assert.ok(toolNames.includes('git_mem_recall'), 'Should list recall tool');
  });
});

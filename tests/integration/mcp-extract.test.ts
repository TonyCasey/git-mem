/**
 * Integration test: MCP git_mem_extract tool
 *
 * Tests the extract tool end-to-end by spawning the server as a subprocess
 * and sending JSON-RPC requests through stdio.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { mcpSession, git, createTestRepo, cleanupRepo } from './mcp/helpers';

describe('Integration: MCP Tool — extract', () => {
  let repoDir: string;

  before(() => {
    const repo = createTestRepo('git-mem-mcp-extract-');
    repoDir = repo.dir;

    // Create commits with heuristic-extractable patterns
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add auth because JWT is better for stateless APIs instead of sessions'], repoDir);

    writeFileSync(join(repoDir, 'db.ts'), 'export function connect() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add database layer — watch out for connection pool exhaustion under load'], repoDir);
  });

  after(() => {
    cleanupRepo(repoDir);
  });

  it('should run extract in dry-run mode via MCP', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/call',
      params: {
        name: 'git_mem_extract',
        arguments: { dry_run: true },
      },
    }]);

    const result = responses[1] as any;
    assert.ok(result.result, 'Should have result');
    assert.ok(!result.result.isError, 'Should not be an error');

    const text = result.result.content[0].text;

    // Could be JSON (if annotations found) or plain text (if none found)
    // Either way, it shouldn't error
    if (text.startsWith('{')) {
      const content = JSON.parse(text);
      assert.equal(content.dryRun, true, 'Should be dry run');
      assert.ok(content.commitsScanned >= 0, 'Should report commits scanned');
    } else {
      assert.ok(text.includes('Scanned'), 'Should report scanning');
    }
  });

  it('should run extract and write notes via MCP', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/call',
      params: {
        name: 'git_mem_extract',
        arguments: { dry_run: false },
      },
    }]);

    const result = responses[1] as any;
    assert.ok(result.result, 'Should have result');
    assert.ok(!result.result.isError, 'Should not be an error');
  });

  it('should list git_mem_extract in tools list', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/list',
      params: {},
    }]);

    const result = responses[1] as any;
    const toolNames = result.result.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('git_mem_extract'), 'Should list extract tool');
  });
});

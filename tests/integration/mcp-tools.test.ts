/**
 * Integration test: MCP remember + recall tools
 *
 * Tests the MCP tools end-to-end by spawning the server as a subprocess
 * and sending JSON-RPC requests through stdio.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const SERVER_PATH = join(__dirname, '..', '..', 'dist', 'mcp-server.js');

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

/**
 * Send a sequence of MCP messages and collect responses.
 * Always sends initialize + initialized notification first.
 */
function mcpSession(cwd: string, requests: object[]): Promise<object[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });

    let stdout = '';
    const responses: object[] = [];
    // We expect 1 response for initialize + 1 per request
    const expectedResponses = 1 + requests.length;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      const lines = stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id !== undefined) {
            responses.push(parsed);
          }
        } catch {
          // Incomplete line, skip
        }
      }
      // Remove processed lines
      stdout = '';

      if (responses.length >= expectedResponses) {
        proc.kill();
        resolve(responses);
      }
    });

    proc.on('error', reject);

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`MCP session timed out. Got ${responses.length}/${expectedResponses} responses`));
    }, 10000);

    proc.on('close', () => {
      clearTimeout(timeout);
    });

    // Send initialize
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    }) + '\n');

    // Send initialized notification
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }) + '\n');

    // Send tool requests with IDs starting from 2
    for (let i = 0; i < requests.length; i++) {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: i + 2,
        ...requests[i],
      }) + '\n');
    }
  });
}

describe('Integration: MCP Tools — remember + recall', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-mcp-tools-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);
    writeFileSync(join(repoDir, 'app.ts'), 'console.log("hello");');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: initial app'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
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

/**
 * Integration test: MCP git_mem_extract tool
 *
 * Tests the extract tool end-to-end by spawning the server as a subprocess
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

function mcpSession(cwd: string, requests: object[]): Promise<object[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });

    let stdout = '';
    const responses: object[] = [];
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
          // Incomplete line
        }
      }
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

    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }) + '\n');

    for (let i = 0; i < requests.length; i++) {
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: i + 2,
        ...requests[i],
      }) + '\n');
    }
  });
}

describe('Integration: MCP Tool — extract', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-mcp-extract-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Create commits with heuristic-extractable patterns
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add auth because JWT is better for stateless APIs instead of sessions'], repoDir);

    writeFileSync(join(repoDir, 'db.ts'), 'export function connect() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add database layer — watch out for connection pool exhaustion under load'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
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

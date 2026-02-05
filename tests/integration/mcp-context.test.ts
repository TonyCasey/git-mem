/**
 * Integration test: MCP git_mem_context tool
 *
 * Tests the context tool end-to-end by spawning the server as a subprocess
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

describe('Integration: MCP Tool — context', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-mcp-context-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    writeFileSync(join(repoDir, 'db.ts'), 'export function connect() {}');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: initial app'], repoDir);

    // Store memories via CLI (using the remember tool via MCP would create a chicken-and-egg)
    // Use git notes directly for setup
    const sha = git(['rev-parse', 'HEAD'], repoDir);
    const memory = {
      memories: [
        {
          id: 'test-auth-1',
          content: 'Use JWT tokens for authentication',
          type: 'decision',
          sha,
          confidence: 'high',
          source: 'user-explicit',
          lifecycle: 'project',
          tags: ['auth', 'jwt'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'test-db-1',
          content: 'PostgreSQL chosen as primary database',
          type: 'decision',
          sha,
          confidence: 'high',
          source: 'user-explicit',
          lifecycle: 'project',
          tags: ['database', 'postgres'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    git(['notes', '--ref=refs/notes/mem', 'add', '-f', '-m', JSON.stringify(memory), sha], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should return no-staged-changes message when nothing is staged', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/call',
      params: {
        name: 'git_mem_context',
        arguments: {},
      },
    }]);

    const result = responses[1] as any;
    assert.ok(result.result, 'Should have result');
    assert.ok(result.result.content[0].text.includes('No staged changes'));
  });

  it('should find auth-related memories when auth file is staged', async () => {
    // Stage a change to auth.ts
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() { /* JWT token */ }');
    git(['add', 'auth.ts'], repoDir);

    const responses = await mcpSession(repoDir, [{
      method: 'tools/call',
      params: {
        name: 'git_mem_context',
        arguments: {},
      },
    }]);

    const result = responses[1] as any;
    assert.ok(result.result, 'Should have result');
    assert.ok(!result.result.isError, 'Should not be an error');

    const content = JSON.parse(result.result.content[0].text);
    assert.ok(content.files.includes('auth.ts'), 'Should list staged files');
    assert.ok(content.memories.length > 0, 'Should find relevant memories');

    // JWT/auth memory should be in results
    const authMemory = content.memories.find((m: any) =>
      m.content.includes('JWT') || m.content.includes('auth')
    );
    assert.ok(authMemory, 'Should find JWT/auth memory');

    // Reset staging
    git(['reset', 'HEAD', 'auth.ts'], repoDir);
  });

  it('should list git_mem_context in tools list', async () => {
    const responses = await mcpSession(repoDir, [{
      method: 'tools/list',
      params: {},
    }]);

    const result = responses[1] as any;
    const toolNames = result.result.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('git_mem_context'), 'Should list context tool');
  });
});

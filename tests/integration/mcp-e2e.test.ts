/**
 * Integration test: MCP end-to-end session
 *
 * Tests a complete MCP session with all git-mem tools in sequence:
 * initialize → tools/list → remember → recall → context → extract
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
 */
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
    }, 15000);

    proc.on('close', () => {
      clearTimeout(timeout);
    });

    // Initialize
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0' },
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

describe('Integration: MCP End-to-End Session', () => {
  let repoDir: string;

  before(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-mem-mcp-e2e-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test User'], repoDir);

    // Create initial commit with heuristic-extractable pattern
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() {}');
    writeFileSync(join(repoDir, 'config.ts'), 'export const PORT = 3000;');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'feat: add auth because JWT is better for stateless APIs instead of sessions'], repoDir);
  });

  after(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('should complete a full session: list → remember → recall → context → extract', async () => {
    // Stage a change for the context tool
    writeFileSync(join(repoDir, 'auth.ts'), 'export function login() { /* validate JWT */ }');
    git(['add', 'auth.ts'], repoDir);

    const responses = await mcpSession(repoDir, [
      // 1. tools/list
      { method: 'tools/list', params: {} },
      // 2. remember
      {
        method: 'tools/call',
        params: {
          name: 'git_mem_remember',
          arguments: {
            text: 'Use bcrypt with cost factor 12 for password hashing',
            type: 'decision',
            tags: 'auth,security',
          },
        },
      },
      // 3. recall
      {
        method: 'tools/call',
        params: {
          name: 'git_mem_recall',
          arguments: { query: 'bcrypt' },
        },
      },
      // 4. context (auth.ts is staged)
      {
        method: 'tools/call',
        params: {
          name: 'git_mem_context',
          arguments: {},
        },
      },
      // 5. extract dry-run
      {
        method: 'tools/call',
        params: {
          name: 'git_mem_extract',
          arguments: { dry_run: true },
        },
      },
    ]);

    // responses[0] = initialize
    // responses[1..5] = our 5 requests
    assert.equal(responses.length, 6, 'Should get 6 responses (init + 5 requests)');

    // --- 1. Verify tools/list ---
    const toolsResult = responses[1] as any;
    const toolNames = toolsResult.result.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('git_mem_remember'), 'Should list remember');
    assert.ok(toolNames.includes('git_mem_recall'), 'Should list recall');
    assert.ok(toolNames.includes('git_mem_context'), 'Should list context');
    assert.ok(toolNames.includes('git_mem_extract'), 'Should list extract');
    assert.equal(toolNames.length, 4, 'Should have exactly 4 tools');

    // --- 2. Verify remember ---
    const rememberResult = responses[2] as any;
    assert.ok(!rememberResult.result.isError, 'Remember should not error');
    const remembered = JSON.parse(rememberResult.result.content[0].text);
    assert.equal(remembered.status, 'stored');
    assert.equal(remembered.content, 'Use bcrypt with cost factor 12 for password hashing');
    assert.equal(remembered.type, 'decision');
    assert.deepEqual(remembered.tags, ['auth', 'security']);

    // --- 3. Verify recall ---
    const recallResult = responses[3] as any;
    assert.ok(!recallResult.result.isError, 'Recall should not error');
    const recalled = JSON.parse(recallResult.result.content[0].text);
    assert.equal(recalled.total, 1);
    assert.ok(recalled.memories[0].content.includes('bcrypt'));

    // --- 4. Verify context ---
    const contextResult = responses[4] as any;
    assert.ok(!contextResult.result.isError, 'Context should not error');
    const contextText = contextResult.result.content[0].text;
    // Either JSON with memories or a message about no relevant memories
    if (contextText.startsWith('{')) {
      const context = JSON.parse(contextText);
      assert.ok(context.files.includes('auth.ts'), 'Should list auth.ts as staged');
      assert.ok(context.totalScanned >= 1, 'Should have scanned memories');
    }
    // Even if no matches scored high enough, no error means success

    // --- 5. Verify extract ---
    const extractResult = responses[5] as any;
    assert.ok(!extractResult.result.isError, 'Extract should not error');
    const extractText = extractResult.result.content[0].text;
    // Either JSON summary or "no patterns found" message
    if (extractText.startsWith('{')) {
      const extract = JSON.parse(extractText);
      assert.equal(extract.dryRun, true, 'Should be dry run');
    } else {
      assert.ok(extractText.includes('Scanned'), 'Should report scanning');
    }
  });

  it('should handle initialize with correct server info', async () => {
    const responses = await mcpSession(repoDir, []);

    const initResult = responses[0] as any;
    assert.equal(initResult.result.serverInfo.name, 'git-mem');
    assert.equal(initResult.result.serverInfo.version, '0.1.0');
    assert.ok(initResult.result.capabilities, 'Should have capabilities');
  });
});

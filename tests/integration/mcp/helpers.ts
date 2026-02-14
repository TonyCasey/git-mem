/**
 * Shared helpers for MCP integration tests.
 *
 * Provides child-process wrappers to spawn the MCP server via tsx
 * and send JSON-RPC requests through stdio.
 */

import { spawn, execFileSync, ChildProcess } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const SERVER_PATH = resolve(PROJECT_ROOT, 'src/mcp-server.ts');

// Use tsx binary from project node_modules — works even when cwd is a temp dir
const TSX_BIN = resolve(PROJECT_ROOT, 'node_modules/.bin/tsx');

export interface IMcpResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Send a single MCP request and get a response.
 * Spawns the server, sends the request, waits for response, kills server.
 */
export function sendMcpRequest(request: object): Promise<IMcpResponse> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX_BIN, [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let resolved = false;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      // MCP responses are newline-delimited JSON
      const lines = stdout.split('\n').filter(Boolean);
      if (lines.length > 0 && !resolved) {
        try {
          const parsed = JSON.parse(lines[0]) as IMcpResponse;
          resolved = true;
          proc.kill();
          resolve(parsed);
        } catch {
          // Not complete yet, wait for more data
        }
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error('MCP server did not respond within 5 seconds'));
      }
    }, 5000);

    proc.on('close', () => {
      clearTimeout(timeout);
    });

    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();
  });
}

/**
 * Send a sequence of MCP messages and collect responses.
 * Always sends initialize + initialized notification first.
 */
export function mcpSession(cwd: string, requests: object[]): Promise<IMcpResponse[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX_BIN, [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });

    let stdout = '';
    const responses: IMcpResponse[] = [];
    // We expect 1 response for initialize + 1 per request
    const expectedResponses = 1 + requests.length;
    let resolved = false;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      const lines = stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as IMcpResponse;
          if (parsed.id !== undefined) {
            responses.push(parsed);
          }
        } catch {
          // Incomplete line, skip
        }
      }
      // Clear processed lines
      stdout = '';

      if (responses.length >= expectedResponses && !resolved) {
        resolved = true;
        proc.kill();
        resolve(responses);
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error(`MCP session timed out. Got ${responses.length}/${expectedResponses} responses`));
      }
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

/** Helper to run git commands. */
export function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
}

/** Create a temp git repo with an initial commit. Returns dir and HEAD sha. */
export function createTestRepo(prefix = 'git-mem-mcp-'): { dir: string; sha: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix));

  git(['init'], dir);
  git(['config', 'user.email', 'test@test.com'], dir);
  git(['config', 'user.name', 'Test User'], dir);

  writeFileSync(join(dir, 'file.txt'), 'initial content');
  git(['add', '.'], dir);
  git(['commit', '-m', 'feat: initial commit'], dir);
  const sha = git(['rev-parse', 'HEAD'], dir);

  return { dir, sha };
}

/** Remove a temp directory. */
export function cleanupRepo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

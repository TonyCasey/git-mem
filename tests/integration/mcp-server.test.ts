/**
 * Integration test: MCP Server protocol handshake
 *
 * Starts the MCP server as a subprocess and verifies it responds
 * correctly to the MCP initialize protocol.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { join } from 'path';

function sendMcpRequest(request: object): Promise<object> {
  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, '..', '..', 'dist', 'mcp-server.js');
    const proc = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      // MCP responses are newline-delimited JSON
      const lines = stdout.split('\n').filter(Boolean);
      if (lines.length > 0) {
        try {
          const parsed = JSON.parse(lines[0]);
          proc.kill();
          resolve(parsed);
        } catch {
          // Not complete yet, wait for more data
        }
      }
    });

    proc.on('error', reject);

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('MCP server did not respond within 5 seconds'));
    }, 5000);

    proc.on('close', () => {
      clearTimeout(timeout);
    });

    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();
  });
}

describe('Integration: MCP Server', () => {
  it('should respond to initialize with server info', async () => {
    const response = await sendMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }) as any;

    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, 1);
    assert.ok(response.result, 'Should have result');
    assert.equal(response.result.serverInfo.name, 'git-mem');
    assert.equal(response.result.serverInfo.version, '0.1.0');
    assert.equal(response.result.protocolVersion, '2024-11-05');
  });
});

/**
 * Integration test: MCP Server protocol handshake
 *
 * Starts the MCP server as a subprocess and verifies it responds
 * correctly to the MCP initialize protocol.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendMcpRequest } from './mcp/helpers';

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

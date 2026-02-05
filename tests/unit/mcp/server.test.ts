/**
 * Unit tests for MCP server creation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../../src/mcp/server';

describe('MCP Server', () => {
  describe('createServer', () => {
    it('should create a server instance', () => {
      const server = createServer();
      assert.ok(server, 'Server should be created');
    });
  });
});

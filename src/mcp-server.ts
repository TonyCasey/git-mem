#!/usr/bin/env node

/**
 * git-mem MCP Server entry point
 *
 * Starts the MCP server with stdio transport for use with
 * AI coding tools (Claude Code, Cursor, OpenCode, etc.).
 *
 * Usage in .mcp.json:
 * {
 *   "mcpServers": {
 *     "git-mem": {
 *       "command": "git-mem-mcp"
 *     }
 *   }
 * }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp/server';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('git-mem MCP server running on stdio');
}

main().catch((err) => {
  console.error('git-mem MCP server fatal error:', err);
  process.exit(1);
});

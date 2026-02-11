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
import { createLogger } from './infrastructure/logging/factory';

const logger = createLogger().child({ component: 'mcp-server' });

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server running on stdio');
}

main().catch((err) => {
  logger.fatal('MCP server fatal error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

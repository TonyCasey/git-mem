/**
 * git-mem MCP Server
 *
 * Creates and configures the MCP server with all git-mem tools.
 * Tools are registered in subsequent issues (GIT-16, GIT-17, GIT-18).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'git-mem',
    version: '0.1.0',
  });

  // Tools will be registered here in GIT-16, GIT-17, GIT-18:
  // - git_mem_remember
  // - git_mem_recall
  // - git_mem_context
  // - git_mem_retrofit

  return server;
}

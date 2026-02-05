/**
 * git-mem MCP Server
 *
 * Creates and configures the MCP server with all git-mem tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRememberTool } from './tools/remember';
import { registerRecallTool } from './tools/recall';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'git-mem',
    version: '0.1.0',
  });

  registerRememberTool(server);
  registerRecallTool(server);

  // More tools in GIT-17, GIT-18:
  // - git_mem_context
  // - git_mem_retrofit

  return server;
}

/**
 * git-mem MCP Server
 *
 * Creates and configures the MCP server with all git-mem tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRememberTool } from './tools/remember';
import { registerRecallTool } from './tools/recall';
import { registerContextTool } from './tools/context';
import { registerRetrofitTool } from './tools/retrofit';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'git-mem',
    version: '0.1.0',
  });

  registerRememberTool(server);
  registerRecallTool(server);
  registerContextTool(server);
  registerRetrofitTool(server);

  return server;
}

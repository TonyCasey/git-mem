/**
 * init-mcp command handler
 *
 * Generates a .mcp.json configuration file for the current repo
 * so AI coding tools can use git-mem via MCP.
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

interface IInitMcpOptions {
  force?: boolean;
  global?: boolean;
}

function isGloballyInstalled(): boolean {
  try {
    execFileSync('which', ['git-mem-mcp'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

export async function initMcpCommand(options: IInitMcpOptions): Promise<void> {
  const targetPath = join(process.cwd(), '.mcp.json');

  if (existsSync(targetPath) && !options.force) {
    console.log('.mcp.json already exists. Use --force to overwrite.');
    return;
  }

  let config: object;

  if (options.global || isGloballyInstalled()) {
    config = {
      mcpServers: {
        'git-mem': {
          command: 'git-mem-mcp',
        },
      },
    };
  } else {
    // Use node with the path to the built mcp-server.js
    const serverPath = join(__dirname, '..', 'mcp-server.js');
    config = {
      mcpServers: {
        'git-mem': {
          command: 'node',
          args: [serverPath],
        },
      },
    };
  }

  writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n');
  console.log('Created .mcp.json');
  console.log('\nTools available:');
  console.log('  git_mem_remember  — Store a memory');
  console.log('  git_mem_recall    — Search memories');
  console.log('  git_mem_context   — Memories relevant to staged changes');
  console.log('  git_mem_liberate  — Liberate knowledge from history');
}

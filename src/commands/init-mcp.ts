/**
 * init-mcp command handler
 *
 * Generates a .mcp.json configuration file for the current repo
 * so AI coding tools can use git-mem via MCP.
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import type { ILogger } from '../domain/interfaces/ILogger';

interface IInitMcpOptions {
  force?: boolean;
  global?: boolean;
}

export function isGloballyInstalled(): boolean {
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

export function buildMcpConfig(options?: { global?: boolean }): object {
  if (options?.global || isGloballyInstalled()) {
    return {
      mcpServers: {
        'git-mem': {
          command: 'git-mem-mcp',
        },
      },
    };
  }

  const serverPath = join(__dirname, '..', 'mcp-server.js');
  return {
    mcpServers: {
      'git-mem': {
        command: 'node',
        args: [serverPath],
      },
    },
  };
}

export async function initMcpCommand(options: IInitMcpOptions, logger?: ILogger): Promise<void> {
  const log = logger?.child({ command: 'init-mcp' });
  log?.info('Command invoked', { force: options.force, global: options.global });
  const targetPath = join(process.cwd(), '.mcp.json');

  if (existsSync(targetPath) && !options.force) {
    console.log('.mcp.json already exists. Use --force to overwrite.');
    return;
  }

  const config = buildMcpConfig({ global: options.global });

  writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n');
  console.log('Created .mcp.json');
  console.log('\nTools available:');
  console.log('  git_mem_remember  — Store a memory');
  console.log('  git_mem_recall    — Search memories');
  console.log('  git_mem_context   — Memories relevant to staged changes');
  console.log('  git_mem_extract   — Extract knowledge from history');
}

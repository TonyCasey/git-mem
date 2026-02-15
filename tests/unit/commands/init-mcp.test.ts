import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildMcpConfig, resolveLocalMcpServerPath } from '../../../src/commands/init-mcp';

interface IMcpConfig {
  mcpServers: {
    'git-mem': {
      command: string;
      args?: string[];
    };
  };
}

describe('buildMcpConfig', () => {
  it('should use global binary when global option is true', () => {
    const config = buildMcpConfig({ global: true }) as IMcpConfig;
    assert.equal(config.mcpServers['git-mem'].command, 'git-mem-mcp');
    assert.equal(config.mcpServers['git-mem'].args, undefined);
  });

  it('should use local server path when global option is false', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-init-mcp-'));
    try {
      const distDir = join(dir, 'dist');
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, 'mcp-server.js'), 'module.exports = {};');

      const config = buildMcpConfig({ global: false, cwd: dir }) as IMcpConfig;

      assert.equal(config.mcpServers['git-mem'].command, 'node');
      assert.deepEqual(config.mcpServers['git-mem'].args, [join(distDir, 'mcp-server.js')]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should use tsx when only source entrypoint exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-init-mcp-'));
    try {
      const srcDir = join(dir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'mcp-server.ts'), 'export {};');

      const config = buildMcpConfig({ global: false, cwd: dir }) as IMcpConfig;

      assert.equal(config.mcpServers['git-mem'].command, 'node');
      assert.deepEqual(config.mcpServers['git-mem'].args, ['--import', 'tsx', join(srcDir, 'mcp-server.ts')]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveLocalMcpServerPath', () => {
  it('should resolve dist/mcp-server.js when present in provided cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-init-mcp-'));
    try {
      const distDir = join(dir, 'dist');
      mkdirSync(distDir, { recursive: true });
      const expected = join(distDir, 'mcp-server.js');
      writeFileSync(expected, 'module.exports = {};');

      const resolved = resolveLocalMcpServerPath(dir);
      assert.equal(resolved, expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should resolve src/mcp-server.ts when dist entrypoint is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-init-mcp-'));
    try {
      const srcDir = join(dir, 'src');
      mkdirSync(srcDir, { recursive: true });
      const expected = join(srcDir, 'mcp-server.ts');
      writeFileSync(expected, 'export {};');

      const resolved = resolveLocalMcpServerPath(dir);
      assert.equal(resolved, expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should throw when no local or runtime entrypoint is found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-mem-init-mcp-'));
    try {
      assert.throws(
        () => resolveLocalMcpServerPath(dir),
        /Could not locate MCP server entrypoint/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

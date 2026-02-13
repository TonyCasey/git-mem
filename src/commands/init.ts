/**
 * init command handler
 *
 * Unified setup: hooks, MCP config, .gitignore, .env check, and optional extract.
 * Replaces separate init-hooks and init-mcp commands.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import prompts from 'prompts';
import type { ILogger } from '../domain/interfaces/ILogger';
import {
  getSettingsPath,
  readExistingSettings,
  buildHooksConfig,
  buildGitMemConfig,
  mergeHooksConfig,
  deepMergeGitMemConfig,
} from './init-hooks';
import { buildMcpConfig } from './init-mcp';
import { installHook, uninstallHook } from '../hooks/prepare-commit-msg';
import { createContainer } from '../infrastructure/di';
import { createStderrProgressHandler } from './progress';

interface IInitCommandOptions {
  yes?: boolean;
  hooks?: boolean;
  uninstallHooks?: boolean;
}

// ── Pure helpers (exported for testing) ──────────────────────────────

/**
 * Ensure entries exist in .gitignore under a `# git-mem` header.
 * Creates the file if it doesn't exist. Reuses existing header on re-runs.
 */
export function ensureGitignoreEntries(cwd: string, entries: string[]): void {
  const gitignorePath = join(cwd, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf8');
  }

  const lines = content.split('\n');
  const missing = entries.filter((entry) => !lines.some((line) => line.trim() === entry));

  if (missing.length === 0) return;

  const hasGitMemHeader = lines.some((line) => line.trim() === '# git-mem');

  if (content.length === 0) {
    // New file
    writeFileSync(gitignorePath, '# git-mem\n' + missing.map((e) => e + '\n').join(''));
    return;
  }

  // Ensure trailing newline before appending
  let append = '';
  if (!content.endsWith('\n')) {
    append += '\n';
  }

  if (!hasGitMemHeader) {
    append += '\n# git-mem\n';
  }

  for (const entry of missing) {
    append += entry + '\n';
  }

  appendFileSync(gitignorePath, append);
}

/**
 * Read ANTHROPIC_API_KEY value from .env file.
 * Returns the value if set, null otherwise.
 */
export function readEnvApiKey(cwd: string): string | null {
  const envPath = join(cwd, '.env');
  if (!existsSync(envPath)) return null;

  const content = readFileSync(envPath, 'utf8');
  const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!match) return null;

  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

/**
 * Ensure .env has an ANTHROPIC_API_KEY= placeholder.
 * Creates .env if it doesn't exist.
 */
export function ensureEnvPlaceholder(cwd: string): void {
  const envPath = join(cwd, '.env');

  if (!existsSync(envPath)) {
    writeFileSync(envPath, 'ANTHROPIC_API_KEY=\n');
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  if (/^ANTHROPIC_API_KEY=/m.test(content)) return;

  const suffix = content.endsWith('\n') ? '' : '\n';
  appendFileSync(envPath, suffix + 'ANTHROPIC_API_KEY=\n');
}

// ── Main command ─────────────────────────────────────────────────────

/** Run unified project setup: hooks, MCP config, .gitignore, and .env. */
export async function initCommand(options: IInitCommandOptions, logger?: ILogger): Promise<void> {
  const log = logger?.child({ command: 'init' });
  const cwd = process.cwd();

  log?.info('Command invoked', { yes: options.yes, hooks: options.hooks, uninstallHooks: options.uninstallHooks });

  // ── Git hook uninstall (early exit) ─────────────────────────────
  if (options.uninstallHooks) {
    const removed = uninstallHook(cwd);
    if (removed) {
      console.log('✓ Removed prepare-commit-msg hook');
    } else {
      console.log('No git-mem prepare-commit-msg hook found.');
    }
    return;
  }

  // ── Prompts (skipped with --yes) ───────────────────────────────
  let claudeIntegration = true;
  let runExtract = false;
  let commitCount = 10;

  if (!options.yes) {
    const response = await prompts([
      {
        type: 'confirm',
        name: 'claudeIntegration',
        message: 'Integrate with Claude Code?',
        initial: true,
      },
      {
        type: 'confirm',
        name: 'runExtract',
        message: 'Extract knowledge from commit history?',
        initial: false,
      },
      {
        type: (prev) => prev ? 'select' : null,
        name: 'commitCount',
        message: 'How many commits to extract?',
        choices: [
          { title: '10', value: 10 },
          { title: '30', value: 30 },
          { title: '50', value: 50 },
        ],
        initial: 0,
      },
    ], {
      onCancel: () => {
        console.log('\nSetup cancelled.');
        process.exit(0);
      },
    });

    claudeIntegration = response.claudeIntegration ?? true;
    runExtract = response.runExtract ?? false;
    commitCount = response.commitCount ?? 10;
  }

  // ── Claude Code hooks ──────────────────────────────────────────
  if (claudeIntegration) {
    const settingsPath = getSettingsPath('project');
    const settingsDir = join(settingsPath, '..');
    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true });
    }

    const settings = readExistingSettings(settingsPath);
    const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
    settings.hooks = mergeHooksConfig(existingHooks, buildHooksConfig());
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`✓ Created ${settingsPath}`);

    // .git-mem.json
    const gitMemConfigPath = join(cwd, '.git-mem.json');
    const existingGitMemConfig = existsSync(gitMemConfigPath)
      ? (() => { try { return JSON.parse(readFileSync(gitMemConfigPath, 'utf8')) as Record<string, unknown>; } catch { return {}; } })()
      : {};
    const mergedGitMemConfig = deepMergeGitMemConfig(existingGitMemConfig, buildGitMemConfig());
    writeFileSync(gitMemConfigPath, JSON.stringify(mergedGitMemConfig, null, 2) + '\n');
    console.log('✓ Created .git-mem.json');
  }

  // ── Git hook (prepare-commit-msg) ─────────────────────────────
  if (options.hooks) {
    const hookResult = installHook(cwd);
    if (hookResult.installed) {
      console.log(`✓ Installed prepare-commit-msg hook${hookResult.wrapped ? ' (wrapped existing hook)' : ''}`);
    } else {
      console.log('✓ prepare-commit-msg hook already installed (skipped)');
    }
  }

  // ── MCP config (skip if already exists) ────────────────────────
  const mcpPath = join(cwd, '.mcp.json');
  if (existsSync(mcpPath)) {
    console.log('✓ .mcp.json already exists (skipped)');
  } else {
    const mcpConfig = buildMcpConfig();
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    console.log('✓ Created .mcp.json');
  }

  // ── .gitignore ─────────────────────────────────────────────────
  ensureGitignoreEntries(cwd, ['.env', '.git-mem.json']);
  console.log('✓ Updated .gitignore');

  // ── .env placeholder ──────────────────────────────────────────
  ensureEnvPlaceholder(cwd);
  console.log('✓ Ensured ANTHROPIC_API_KEY placeholder in .env');

  // ── Extract from history ─────────────────────────────────────
  if (runExtract) {
    const apiKey = readEnvApiKey(cwd);
    const enrich = !!apiKey;

    if (enrich) {
      process.env.ANTHROPIC_API_KEY = apiKey;
      console.log(`\nExtracting knowledge from ${commitCount} commits with LLM enrichment...`);
    } else {
      console.log(`\nExtracting knowledge from ${commitCount} commits (heuristic only)...`);
    }

    const container = createContainer({ logger, scope: 'init', enrich });
    const { extractService } = container.cradle;

    const result = await extractService.extract({
      maxCommits: commitCount,
      enrich,
      onProgress: createStderrProgressHandler(),
    });

    console.log(
      `Commits scanned: ${result.commitsScanned}  |  ` +
      `Annotated: ${result.commitsAnnotated}  |  ` +
      `Facts: ${result.factsExtracted}  |  ` +
      `Duration: ${result.durationMs}ms`,
    );

    if (!enrich) {
      console.log('\nFor a deeper AI summary of each commit, add your ANTHROPIC_API_KEY to .env and run:');
      console.log('  git-mem extract --enrich');
    }
  }
}

/**
 * init command handler
 *
 * Unified setup: hooks, MCP config, .gitignore, .env check, and optional liberate.
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
import { createContainer } from '../infrastructure/di';
import { createStderrProgressHandler } from './progress';

interface IInitCommandOptions {
  yes?: boolean;
  commitCount?: string;
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

/** Run unified project setup: hooks, MCP config, .gitignore, .env, and optional liberate. */
export async function initCommand(options: IInitCommandOptions, logger?: ILogger): Promise<void> {
  const log = logger?.child({ command: 'init' });
  const cwd = process.cwd();

  log?.info('Command invoked', { yes: options.yes, commitCount: options.commitCount });

  // ── Prompts (skipped with --yes) ───────────────────────────────
  let commitCount = options.commitCount ? parseInt(options.commitCount, 10) : 100;
  if (!Number.isFinite(commitCount) || commitCount <= 0) {
    console.log(`Invalid --commit-count value: "${options.commitCount}". Using default (100).`);
    commitCount = 100;
  }
  let claudeIntegration = true;

  if (!options.yes) {
    const response = await prompts([
      {
        type: 'number',
        name: 'commitCount',
        message: 'How many commits to free?',
        initial: commitCount,
      },
      {
        type: 'confirm',
        name: 'claudeIntegration',
        message: 'Integrate with Claude Code?',
        initial: true,
      },
    ], {
      onCancel: () => {
        console.log('\nSetup cancelled.');
        process.exit(0);
      },
    });

    commitCount = response.commitCount ?? commitCount;
    claudeIntegration = response.claudeIntegration ?? true;
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

  // ── API key check & liberate ───────────────────────────────────
  console.log('\nChecking for ANTHROPIC_API_KEY in .env...\n');

  const apiKey = readEnvApiKey(cwd);

  if (apiKey) {
    process.env.ANTHROPIC_API_KEY = apiKey;
    console.log(`Extracting knowledge from ${commitCount} commits with LLM enrichment...`);

    const container = createContainer({ logger, scope: 'init', enrich: true });
    const { liberateService } = container.cradle;

    const result = await liberateService.liberate({
      maxCommits: commitCount,
      enrich: true,
      onProgress: createStderrProgressHandler(),
    });

    console.log(
      `Commits scanned: ${result.commitsScanned}  |  ` +
      `Annotated: ${result.commitsAnnotated}  |  ` +
      `Facts: ${result.factsExtracted}  |  ` +
      `Duration: ${result.durationMs}ms`,
    );
  } else {
    ensureEnvPlaceholder(cwd);
    console.log('✓ Added ANTHROPIC_API_KEY= to .env');
    console.log('→ Add your key to .env, then run:');
    console.log(`  git-mem liberate --enrich --commit-count ${commitCount}`);
  }
}

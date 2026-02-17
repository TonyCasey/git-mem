/**
 * RuntimeService
 *
 * Infrastructure implementation of IRuntimeService.
 * Persists runtime session data to .git-mem/runtime.json for cross-hook
 * agent/model detection when environment variables aren't available.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IRuntimeService, IRuntimeData } from '../../domain/interfaces/IRuntimeService';
import { getConfigDir } from '../../hooks/utils/config';

/** File name for runtime session data. */
const RUNTIME_FILE = 'runtime.json';

/** Default TTL: 2 hours in milliseconds. */
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

export class RuntimeService implements IRuntimeService {
  activate(data: IRuntimeData, cwd?: string): void {
    try {
      const configDir = getConfigDir(cwd);

      // Create .git-mem/ directory if missing
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      const filePath = join(configDir, RUNTIME_FILE);
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Never throw — hooks must not crash on runtime errors
    }
  }

  deactivate(cwd?: string): void {
    try {
      const configDir = getConfigDir(cwd);
      const filePath = join(configDir, RUNTIME_FILE);

      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Never throw — handle missing file gracefully
    }
  }

  read(cwd?: string, ttlMs?: number): IRuntimeData | undefined {
    try {
      const configDir = getConfigDir(cwd);
      const filePath = join(configDir, RUNTIME_FILE);

      if (!existsSync(filePath)) {
        return undefined;
      }

      const content = readFileSync(filePath, 'utf8');
      const data = JSON.parse(content) as IRuntimeData;

      // Validate structure
      if (
        !data ||
        typeof data.timestamp !== 'string' ||
        typeof data.sessionId !== 'string' ||
        typeof data.source !== 'string'
      ) {
        return undefined;
      }

      // Check TTL
      const ttl = ttlMs ?? DEFAULT_TTL_MS;
      const timestamp = new Date(data.timestamp).getTime();

      // Reject invalid or non-parseable timestamps
      if (!Number.isFinite(timestamp)) {
        return undefined;
      }

      const age = Date.now() - timestamp;

      // Reject future timestamps (with small skew allowance) or stale data
      if (age < -60000 || age > ttl) {
        return undefined;
      }

      return data;
    } catch {
      // Never throw — return undefined on parse errors
      return undefined;
    }
  }
}

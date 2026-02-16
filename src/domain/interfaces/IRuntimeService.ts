/**
 * IRuntimeService
 *
 * Domain interface for managing runtime session data stored in the repo.
 * Enables AI agent/model detection to persist across hook invocations
 * even when environment variables are not available (e.g., post-commit
 * hooks running in plain terminal shells).
 */

/**
 * Runtime session data written to .git-mem/runtime.json.
 */
export interface IRuntimeData {
  readonly sessionId: string;
  readonly agent: string | undefined;
  readonly model: string | undefined;
  readonly timestamp: string; // ISO 8601
  readonly source: string; // e.g., "env:CLAUDECODE"
}

/**
 * Service for activating/deactivating runtime session data.
 * Implementation lives in infrastructure layer.
 */
export interface IRuntimeService {
  /**
   * Write runtime.json with session data.
   * Creates .git-mem/ directory if missing.
   * Never throws — errors are silently ignored.
   * @param data - Runtime data to persist
   * @param cwd - Working directory (defaults to process.cwd())
   */
  activate(data: IRuntimeData, cwd?: string): void;

  /**
   * Remove runtime.json file.
   * Never throws — handles missing file gracefully.
   * @param cwd - Working directory (defaults to process.cwd())
   */
  deactivate(cwd?: string): void;

  /**
   * Read runtime.json if it exists and is fresh.
   * @param cwd - Working directory (defaults to process.cwd())
   * @param ttlMs - Time-to-live in milliseconds (default: 2 hours)
   * @returns Runtime data if file exists and is within TTL, undefined otherwise
   */
  read(cwd?: string, ttlMs?: number): IRuntimeData | undefined;
}

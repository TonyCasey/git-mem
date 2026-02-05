/**
 * INotesService
 *
 * Domain interface for reading and writing structured JSON notes
 * in a dedicated git notes ref (refs/notes/mem).
 *
 * Git notes attach metadata to any git object (usually commits)
 * without modifying the object itself.
 */

/**
 * Default git notes ref used by git-mem.
 */
export const DEFAULT_NOTES_REF = 'refs/notes/mem';

/**
 * A git note entry (object SHA → note content mapping).
 */
export interface INoteEntry {
  /** Git object SHA the note is attached to. */
  readonly objectSha: string;
  /** Note blob SHA. */
  readonly noteSha: string;
}

/**
 * Git notes service interface.
 *
 * Reads and writes structured JSON notes in refs/notes/mem.
 */
export interface INotesService {
  /**
   * Read the note content for a git object.
   * @param objectSha - Git object SHA to read note for.
   * @param ref - Notes ref (default: refs/notes/mem).
   * @param cwd - Working directory.
   * @returns Note content string, or null if no note exists.
   */
  read(objectSha: string, ref?: string, cwd?: string): string | null;

  /**
   * Write (or overwrite) a note on a git object.
   * @param objectSha - Git object SHA to attach note to.
   * @param content - Note content (typically JSON string).
   * @param ref - Notes ref (default: refs/notes/mem).
   * @param cwd - Working directory.
   */
  write(objectSha: string, content: string, ref?: string, cwd?: string): void;

  /**
   * Append content to an existing note on a git object.
   * If no note exists, creates a new one.
   * @param objectSha - Git object SHA.
   * @param content - Content to append.
   * @param ref - Notes ref (default: refs/notes/mem).
   * @param cwd - Working directory.
   */
  append(objectSha: string, content: string, ref?: string, cwd?: string): void;

  /**
   * Remove a note from a git object.
   * @param objectSha - Git object SHA.
   * @param ref - Notes ref (default: refs/notes/mem).
   * @param cwd - Working directory.
   */
  remove(objectSha: string, ref?: string, cwd?: string): void;

  /**
   * List all notes in a ref.
   * @param ref - Notes ref (default: refs/notes/mem).
   * @param cwd - Working directory.
   * @returns Array of note entries (object SHA → note SHA mappings).
   */
  list(ref?: string, cwd?: string): INoteEntry[];
}

/**
 * stdin utility for Claude Code hooks.
 *
 * Reads JSON from stdin and returns a typed result.
 * Hooks must never crash — returns empty object on failure.
 */

export async function readStdin<T = Record<string, unknown>>(): Promise<T> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk: string | null;
      while ((chunk = process.stdin.read() as string | null) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data) as T);
      } catch {
        resolve({} as T);
      }
    });

    // Safety: if stdin is already closed or empty, resolve after a tick
    setTimeout(() => {
      if (!data) {
        resolve({} as T);
      }
    }, 100);
  });
}

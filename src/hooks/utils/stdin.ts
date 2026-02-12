/**
 * stdin utility for Claude Code hooks.
 *
 * Reads JSON from stdin and returns a typed result.
 * Hooks must never crash — returns empty object on failure.
 */

export async function readStdin<T = Record<string, unknown>>(): Promise<T> {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;

    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // If stdin is a TTY or already ended, no data will arrive
    if (process.stdin.isTTY || process.stdin.readableEnded) {
      finish({} as T);
      return;
    }

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk: string | null;
      while ((chunk = process.stdin.read() as string | null) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      try {
        finish(JSON.parse(data) as T);
      } catch {
        finish({} as T);
      }
    });

    process.stdin.on('error', () => finish({} as T));
  });
}

import path from 'node:path';

/**
 * Returns true when the resolved `requestedPath` lives inside (or equals)
 * the resolved `allowedBase`.  Prevents directory-traversal attacks.
 */
export function isPathSafe(requestedPath: string, allowedBase: string): boolean {
  const resolved = path.resolve(requestedPath);
  const base = path.resolve(allowedBase);
  return resolved === base || resolved.startsWith(base + path.sep);
}

/**
 * Resolves `requestedPath` relative to `allowedBase` and returns the
 * absolute path if it is within the allowed directory.  Throws otherwise.
 */
export function sanitizePath(requestedPath: string, allowedBase: string): string {
  const resolved = path.resolve(allowedBase, requestedPath);
  if (!isPathSafe(resolved, allowedBase)) {
    throw new Error('Path traversal detected: access denied');
  }
  return resolved;
}

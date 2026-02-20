import { Request, Response, NextFunction } from 'express';
import { isPathSafe } from '../utils/pathSecurity.js';

/**
 * Middleware factory that validates a path parameter or body field
 * against a base directory to prevent path traversal attacks.
 */
export function validatePath(baseDir: string, paramName = 'path') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestedPath =
      req.params[paramName] || req.query[paramName] || req.body?.[paramName];

    if (requestedPath && typeof requestedPath === 'string') {
      if (!isPathSafe(requestedPath, baseDir)) {
        res.status(403).json({ error: 'Path traversal detected' });
        return;
      }
    }
    next();
  };
}

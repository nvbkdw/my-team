import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[ErrorHandler]', err.message, err.stack);
  const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500;
  res.status(statusCode).json({ error: err.message });
}

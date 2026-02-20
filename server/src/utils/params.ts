import type { Request } from 'express';

/**
 * Safely extract a route parameter as a string.
 * Express 5 types params as string | string[], but our routes only use single params.
 */
export function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

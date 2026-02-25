import { apiFetch } from './client.js';

export interface TraceEntry {
  ts: string;
  run: number;
  type: string;
  [key: string]: unknown;
}

interface TracesResponse {
  entries: TraceEntry[];
  total: number;
  hasMore: boolean;
}

export function fetchTraces(
  cardId: string,
  options?: { offset?: number; limit?: number },
): Promise<TracesResponse> {
  const params = new URLSearchParams();
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return apiFetch<TracesResponse>(`/cards/${cardId}/traces${qs ? `?${qs}` : ''}`);
}

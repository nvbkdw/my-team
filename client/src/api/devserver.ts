import { apiFetch } from './client.js';

export function startDevServer(cardId: string, command?: string) {
  return apiFetch<{ port: number; url: string; previewUrl: string }>(`/cards/${cardId}/devserver/start`, {
    method: 'POST',
    body: JSON.stringify(command ? { command } : {}),
  });
}

export function stopDevServer(cardId: string) {
  return apiFetch<{ ok: boolean }>(`/cards/${cardId}/devserver/stop`, {
    method: 'POST',
  });
}

export function fetchDevServerStatus(cardId: string) {
  return apiFetch<{ status: string; port?: number; url?: string; previewUrl?: string; error?: string }>(
    `/cards/${cardId}/devserver/status`,
  );
}

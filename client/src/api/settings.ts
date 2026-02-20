import { apiFetch } from './client.js';

export interface SettingEntry {
  key: string;
  value: string;
}

export function fetchSettings(): Promise<SettingEntry[]> {
  return apiFetch<SettingEntry[]>('/settings');
}

export function fetchSetting(key: string): Promise<SettingEntry> {
  return apiFetch<SettingEntry>(`/settings/${encodeURIComponent(key)}`);
}

export function setSetting(key: string, value: string): Promise<SettingEntry> {
  return apiFetch<SettingEntry>(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

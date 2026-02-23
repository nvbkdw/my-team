import { create } from 'zustand';

export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

interface DevServerState {
  statuses: Record<string, DevServerStatus>;
  ports: Record<string, number>;
  /** Direct dev server URLs (for "Open in browser") */
  urls: Record<string, string>;
  /** Preview proxy URLs with injected nav script (for iframe) */
  previewUrls: Record<string, string>;
  errors: Record<string, string>;

  setDevServerStatus: (
    cardId: string,
    status: DevServerStatus,
    port?: number,
    url?: string,
    error?: string,
    previewUrl?: string,
  ) => void;
  setAllStatuses: (statuses: Record<string, { status: string; port?: number; url?: string; previewUrl?: string }>) => void;
  removeDevServer: (cardId: string) => void;
}

export const useDevServerStore = create<DevServerState>((set) => ({
  statuses: {},
  ports: {},
  urls: {},
  previewUrls: {},
  errors: {},

  setDevServerStatus: (cardId, status, port, url, error, previewUrl) => {
    set((s) => ({
      statuses: { ...s.statuses, [cardId]: status },
      ports: port != null ? { ...s.ports, [cardId]: port } : s.ports,
      urls: url ? { ...s.urls, [cardId]: url } : s.urls,
      previewUrls: previewUrl ? { ...s.previewUrls, [cardId]: previewUrl } : s.previewUrls,
      errors: error ? { ...s.errors, [cardId]: error } : (() => {
        const { [cardId]: _, ...rest } = s.errors;
        return rest;
      })(),
    }));
  },

  setAllStatuses: (statuses) => {
    const mapped: Record<string, DevServerStatus> = {};
    const ports: Record<string, number> = {};
    const urls: Record<string, string> = {};
    const previewUrls: Record<string, string> = {};
    for (const [cardId, info] of Object.entries(statuses)) {
      mapped[cardId] = info.status as DevServerStatus;
      if (info.port != null) ports[cardId] = info.port;
      if (info.url) urls[cardId] = info.url;
      if (info.previewUrl) previewUrls[cardId] = info.previewUrl;
    }
    set({ statuses: mapped, ports, urls, previewUrls });
  },

  removeDevServer: (cardId) => {
    set((s) => {
      const { [cardId]: _a, ...restStatuses } = s.statuses;
      const { [cardId]: _b, ...restPorts } = s.ports;
      const { [cardId]: _c, ...restUrls } = s.urls;
      const { [cardId]: _d, ...restPreviewUrls } = s.previewUrls;
      const { [cardId]: _e, ...restErrors } = s.errors;
      return { statuses: restStatuses, ports: restPorts, urls: restUrls, previewUrls: restPreviewUrls, errors: restErrors };
    });
  },
}));

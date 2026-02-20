import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('[vite proxy] API error (backend may still be starting):', err.message);
          });
        },
      },
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
        rewriteWsOrigin: true,
        configure: (proxy) => {
          // Suppress transient proxy errors on both HTTP and WS paths.
          // These commonly occur at startup when the backend isn't ready yet.
          proxy.on('error', (err, _req, res) => {
            console.log('[vite proxy] WS proxy error (backend may still be starting):', err.message);
            if (res && 'writeHead' in res && !res.headersSent) {
              (res as import('http').ServerResponse).writeHead(502, { 'Content-Type': 'text/plain' });
              (res as import('http').ServerResponse).end('Backend not ready');
            }
          });
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (err) => {
              console.log('[vite proxy] WS socket error:', err.message);
            });
          });
        },
      },
    },
  },
});

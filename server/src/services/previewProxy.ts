import http from 'node:http';
import net from 'node:net';

/**
 * Navigation monitoring script injected into HTML responses.
 * Hooks pushState/replaceState and listens for popstate/hashchange,
 * then sends the current path to the parent frame via postMessage.
 */
const NAV_SCRIPT = `<script>(function(){
function p(){
try{parent.postMessage({type:"__devserver_nav",path:location.pathname+location.search+location.hash},"*")}catch(e){}
}
var a=history.pushState,b=history.replaceState;
history.pushState=function(){a.apply(this,arguments);p()};
history.replaceState=function(){b.apply(this,arguments);p()};
addEventListener("popstate",p);
addEventListener("hashchange",p);
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",p):p()
})()</script>`;

function injectScript(html: string): string {
  // Inject before </head> if present, otherwise before </body>, otherwise append
  const headIdx = html.indexOf('</head>');
  if (headIdx !== -1) {
    return html.slice(0, headIdx) + NAV_SCRIPT + html.slice(headIdx);
  }
  const bodyIdx = html.indexOf('</body>');
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + NAV_SCRIPT + html.slice(bodyIdx);
  }
  return html + NAV_SCRIPT;
}

/**
 * Creates an HTTP proxy server that forwards to a dev server and injects
 * a navigation monitoring script into HTML responses.
 * Also handles WebSocket upgrade pass-through (for HMR).
 */
export function createPreviewProxy(targetPort: number): http.Server {
  const server = http.createServer((clientReq, clientRes) => {
    // Strip accept-encoding so the dev server returns uncompressed HTML
    // (needed for reliable script injection)
    const headers = { ...clientReq.headers };
    delete headers['accept-encoding'];
    headers['host'] = `localhost:${targetPort}`;

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: clientReq.url,
        method: clientReq.method,
        headers,
      },
      (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';

        if (contentType.includes('text/html')) {
          // Buffer HTML to inject monitoring script
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on('end', () => {
            let html = Buffer.concat(chunks).toString('utf-8');
            html = injectScript(html);

            // Recalculate content-length after injection
            const responseHeaders = { ...proxyRes.headers };
            delete responseHeaders['content-length'];
            delete responseHeaders['content-encoding'];

            clientRes.writeHead(proxyRes.statusCode || 200, responseHeaders);
            clientRes.end(html);
          });
        } else {
          // Stream non-HTML responses through unmodified
          clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(clientRes);
        }
      },
    );

    proxyReq.on('error', (err) => {
      console.error(`[PreviewProxy] Proxy error: ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      clientRes.end('Dev server unavailable');
    });

    clientReq.pipe(proxyReq);
  });

  // WebSocket upgrade pass-through (for HMR)
  server.on('upgrade', (req, socket, head) => {
    const proxySocket = net.createConnection(
      { port: targetPort, host: '127.0.0.1' },
      () => {
        // Reconstruct the HTTP upgrade request to forward to the dev server
        let reqLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          if (req.rawHeaders[i].toLowerCase() === 'host') {
            reqLine += `Host: localhost:${targetPort}\r\n`;
          } else {
            reqLine += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
          }
        }
        reqLine += '\r\n';

        proxySocket.write(reqLine);
        if (head.length > 0) proxySocket.write(head);

        socket.pipe(proxySocket);
        proxySocket.pipe(socket);
      },
    );

    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  return server;
}

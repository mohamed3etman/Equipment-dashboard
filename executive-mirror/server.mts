/**
 * Custom server: Next.js + the session WebSocket.
 *
 * Next's route handlers cannot accept a WebSocket upgrade, and the live loop
 * needs a persistent bidirectional binary channel (PCM up, audio down), so the
 * session endpoint is attached to the HTTP server directly.
 *
 * Run with: npm run dev:live   (or npm run start:live for a built app)
 */
import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { attachSessionSocket } from './src/session/ws-server';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => handle(req, res, parse(req.url ?? '', true)));
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url ?? '', true);
  if (pathname !== '/ws/session') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => attachSessionSocket(ws));
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Executive Mirror on http://localhost:${port}  (voice socket at /ws/session)`);
});

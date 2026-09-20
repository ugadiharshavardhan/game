/**
 * The session server for Moonlight Seva: teams, lobbies, the shared village, and both boards.
 *
 * It is deliberately small. One process serves the built game and the WebSocket beside it, keeps
 * its boards in a JSON file, and runs the same `Authority` the browser's offline mode runs — so
 * the rules a player meets are identical whether a server is there or not.
 *
 *   node --experimental-strip-types server/index.ts          (npm run server)
 *   PORT=8080 MAX_PLAYERS=6 node --experimental-strip-types server/index.ts
 *
 * Everything a contest organiser might want to change is an environment variable; nothing about
 * the session rules is compiled into the client.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Authority, type PersistedState } from '../src/net/Authority.ts';
import type { ClientMessage } from '../src/shared/multiplayer.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = join(import.meta.dirname, '..', 'dist');
const DATA = process.env.DATA_FILE ?? join(import.meta.dirname, 'data', 'boards.json');
/** A client may send this many messages a second before it is ignored — one player cannot flood. */
const MESSAGE_BUDGET = 60;
const MAX_MESSAGE_BYTES = 4096;

const config = {
  minPlayers: Number(process.env.MIN_PLAYERS ?? 1),
  maxPlayers: Number(process.env.MAX_PLAYERS ?? 4),
  requireReady: process.env.REQUIRE_READY !== 'false',
  lobbyTimeoutMs: Number(process.env.LOBBY_TIMEOUT_MIN ?? 30) * 60_000,
  syncHz: Number(process.env.SYNC_HZ ?? 10),
  teamScoreCount: Number(process.env.TEAM_SCORE_COUNT ?? 0),
} as const;

const store = {
  load(): PersistedState | null {
    try {
      return existsSync(DATA) ? (JSON.parse(readFileSync(DATA, 'utf8')) as PersistedState) : null;
    } catch (error) {
      console.warn('[session] could not read the boards:', error);
      return null;
    }
  },
  save(state: PersistedState) {
    try {
      mkdirSync(join(DATA, '..'), { recursive: true });
      writeFileSync(DATA, JSON.stringify(state));
    } catch (error) {
      console.warn('[session] could not write the boards:', error);
    }
  },
};

const authority = new Authority({ config, store });
setInterval(() => authority.tick(), 30_000).unref();

// ---- the built game, and a health check --------------------------------------------------------

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serve(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, players: 'ready', config }));
    return;
  }
  if (!existsSync(DIST)) {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Moonlight Seva session server. Build the game (npm run build) to serve it here.');
    return;
  }
  // Never let a path climb out of dist; anything unknown is the app's own route.
  const wanted = normalize(join(DIST, decodeURIComponent(url.pathname)));
  const file = wanted.startsWith(DIST) && existsSync(wanted) && extname(wanted) ? wanted : join(DIST, 'index.html');
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const immutable = file.includes('/assets/') && extname(file) !== '.html';
  response.writeHead(200, {
    'content-type': type,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(response);
}

// ---- sockets -----------------------------------------------------------------------------------

const http = createServer(serve);
const sockets = new WebSocketServer({ server: http, path: '/session', maxPayload: MAX_MESSAGE_BYTES });

let nextId = 1;
sockets.on('connection', (socket: WebSocket) => {
  const id = `c${nextId++}`;
  let budget = MESSAGE_BUDGET;
  let alive = true;
  const refill = setInterval(() => (budget = MESSAGE_BUDGET), 1000);
  const heartbeat = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, 20_000);
  socket.on('pong', () => (alive = true));

  authority.connect(id, (message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  });

  socket.on('message', (raw) => {
    alive = true;
    if (budget-- <= 0) return;
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }
    if (!message || typeof message.type !== 'string') return;
    try {
      authority.message(id, message);
    } catch (error) {
      console.warn('[session] bad message', message.type, error);
    }
  });

  socket.on('close', () => {
    clearInterval(refill);
    clearInterval(heartbeat);
    authority.disconnect(id);
  });
});

http.listen(PORT, () => {
  console.log(`[session] Moonlight Seva on http://localhost:${PORT}  ·  sockets at /session`);
  console.log(`[session] teams of ${config.minPlayers}–${config.maxPlayers}, ready ${config.requireReady ? 'required' : 'optional'}, sync ${config.syncHz} Hz`);
});

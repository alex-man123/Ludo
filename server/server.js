// Serverul aplicației: fișiere statice (public/ + shared/) și Socket.IO pentru camerele online.
// Pornire: `npm start`. Variabile de mediu: vezi .env.example.

import http from 'node:http';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { attachOnline } from './online.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const [base, rel] = clean.startsWith('/shared/')
    ? [SHARED, clean.slice('/shared/'.length)]
    : [PUBLIC, clean === '/' ? 'index.html' : clean.slice(1)];
  const full = path.resolve(base, rel);
  // Împiedică ieșirea din folderul permis (path traversal).
  return full.startsWith(base + path.sep) ? full : null;
}

// Adaptoare virtuale (mașini virtuale, WSL, Docker, VPN) — nu sunt rețeaua Wi-Fi/Ethernet reală.
const VIRTUAL_NAME = /vmware|virtualbox|vbox|vethernet|hyper-v|wsl|docker|loopback|tailscale|zerotier|bluetooth/i;
const VIRTUAL_MAC = /^(00:50:56|00:0c:29|00:05:69|00:15:5d|08:00:27|02:42)/i;

/** Adresele IPv4 ale calculatorului în rețeaua locală, cele reale (Wi-Fi/Ethernet) primele. */
export function lanAddresses() {
  const all = Object.entries(os.networkInterfaces())
    .flatMap(([name, list]) => (list || []).map(a => ({ ...a, name })))
    .filter(a => a.family === 'IPv4' && !a.internal);
  const real = all.filter(a => !VIRTUAL_NAME.test(a.name) && !VIRTUAL_MAC.test(a.mac || ''));
  return (real.length ? real : all).map(a => ({ address: a.address, name: a.name }));
}

const isLoopback = addr => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleRequest(req, res, port) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const url = req.url.split('?')[0];
  if (url === '/healthz') return sendJson(res, 200, { ok: true });
  if (url === '/api/lan') {
    // Doar pentru cine deschide aplicația chiar pe calculatorul serverului: sugerăm adresa LAN.
    const local = isLoopback(req.socket.remoteAddress);
    return sendJson(res, 200, {
      addresses: local ? lanAddresses().map(a => ({ url: `http://${a.address}:${port}`, name: a.name })) : [],
    });
  }

  let file;
  try { file = resolvePath(req.url); } catch { file = null; }
  if (!file) {
    res.writeHead(400).end('Cerere invalidă');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Pagina nu există');
  }
}

/**
 * Originile acceptate pentru Socket.IO: implicit doar aceeași origine ca pagina.
 * ALLOWED_ORIGINS (listă separată prin virgulă) permite un frontend găzduit separat.
 */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;                         // clienți care nu sunt browsere (ex. teste)
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

/** Creează și pornește serverul. Întoarce { server, io, manager, port }. */
export function startServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0', roomOptions = {} } = {}) {
  return new Promise((resolve, reject) => {
    let actualPort = port;
    const server = http.createServer((req, res) => handleRequest(req, res, actualPort));
    const io = new Server(server, {
      allowRequest: (req, cb) => cb(null, originAllowed(req)),
      maxHttpBufferSize: 10_000,                    // mesajele jocului sunt mici
      cors: process.env.ALLOWED_ORIGINS ? { origin: process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) } : undefined,
    });
    const manager = attachOnline(io, roomOptions);
    server.once('error', reject);
    server.listen(port, host, () => {
      actualPort = server.address().port;
      resolve({ server, io, manager, port: actualPort });
    });
  });
}

// Pornire directă: `node server/server.js`
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  startServer().then(({ port }) => {
    console.log(`LUDO rulează la http://localhost:${port}`);
    for (const a of lanAddresses()) console.log(`  în rețeaua locală (${a.name}): http://${a.address}:${port}`);
  }).catch(err => {
    if (err.code === 'EADDRINUSE') {
      const port = Number(process.env.PORT) || 3000;
      console.error(`Portul ${port} este deja folosit (poate jocul rulează deja în alt terminal).`);
      console.error(`Deschide http://localhost:${port} sau pornește pe alt port: $env:PORT=3001; npm start`);
      process.exit(1);
    }
    throw err;
  });
}

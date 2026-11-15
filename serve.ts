// Kestrel Yard — a local server for playtesting the game in a real browser.
// Serves this directory at http://localhost:8080, so game/index.html loads with
// its import map and modules as it will from the grader. Node 22, standard
// library only. Run it from this directory:
//
//   node serve.ts
//
// Then open http://localhost:8080/game/ — or http://localhost:8080/game/?shot=play
// for a staged capture frame.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/game/';
  if (path.endsWith('/')) path += 'index.html';
  const file = join(here, path);
  if (!file.startsWith(here) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => {
  console.log(`Kestrel Yard serving at http://localhost:${port}/game/`);
});

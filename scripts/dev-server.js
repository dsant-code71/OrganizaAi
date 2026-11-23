// Servidor de desenvolvimento local que replica as regras do vercel.json.
// Sem dependencias externas: node scripts/dev-server.js (ou npm run dev).

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERCEL_CONFIG = path.join(ROOT, 'vercel.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function carregarConfig() {
  try {
    return JSON.parse(fs.readFileSync(VERCEL_CONFIG, 'utf8'));
  } catch (erro) {
    console.error(`Nao foi possivel ler ${VERCEL_CONFIG}: ${erro.message}`);
    process.exit(1);
  }
}

const config = carregarConfig();
const redirects = Array.isArray(config.redirects) ? config.redirects : [];
const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
const headerRules = Array.isArray(config.headers) ? config.headers : [];

function semBarraFinal(valor) {
  return valor.length > 1 ? valor.replace(/\/+$/, '') : valor;
}

function corresponde(source, pathname) {
  if (source === pathname) {
    return true;
  }

  if (source === '*(.*)' || source === '/(.*)' || source === '*' || source === '/:path*') {
    return true;
  }

  if (semBarraFinal(source) === semBarraFinal(pathname)) {
    return true;
  }

  if (source.includes('*')) {
    const partes = source.split('*').map((parte) => parte.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('^' + partes.join('.*') + '$').test(pathname);
  }

  return false;
}

function aplicarRegra(lista, pathname) {
  for (const regra of lista) {
    if (corresponde(regra.source, pathname)) {
      return regra;
    }
  }
  return null;
}

function headersPara(pathname) {
  const headers = {};
  for (const regra of headerRules) {
    if (!corresponde(regra.source, pathname)) {
      continue;
    }
    for (const header of regra.headers || []) {
      headers[header.key] = header.value;
    }
  }
  return headers;
}

function caminhoBloqueado(pathname) {
  const segmentos = decodeURIComponent(pathname).split(/[\\/]+/);
  return segmentos.some((segmento) => segmento.startsWith('.'));
}

function resolverArquivo(pathname) {
  let relativo = decodeURIComponent(pathname);

  if (relativo.endsWith('/')) {
    relativo += 'index.html';
  }

  if (caminhoBloqueado(relativo)) {
    return null;
  }

  const destino = path.resolve(ROOT, '.' + relativo);
  if (destino !== ROOT && !destino.startsWith(ROOT + path.sep)) {
    return null;
  }

  return destino;
}

function responder(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const metodo = req.method === 'HEAD' ? 'HEAD' : 'GET';

  if (metodo !== 'GET' && metodo !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...headersPara(pathname) }).end('metodo nao permitido');
    return;
  }

  const redirect = aplicarRegra(redirects, pathname);
  if (redirect) {
    const status = redirect.permanent === true ? 308 : 307;
    res.writeHead(status, { Location: redirect.destination, ...headersPara(pathname) }).end();
    return;
  }

  const rewrite = aplicarRegra(rewrites, pathname);
  const caminhoEfetivo = rewrite ? rewrite.destination : pathname;
  const arquivo = resolverArquivo(caminhoEfetivo);

  if (!arquivo) {
    res.writeHead(403, headersPara(pathname)).end('acesso negado');
    return;
  }

  fs.stat(arquivo, (erro, stats) => {
    if (erro || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...headersPara(pathname) }).end('nao encontrado');
      return;
    }

    const headers = {
      'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      ...headersPara(pathname),
    };

    if (metodo === 'HEAD') {
      res.writeHead(200, headers).end();
      return;
    }

    res.writeHead(200, headers);
    fs.createReadStream(arquivo).pipe(res);
  });
}

http.createServer(responder).listen(PORT, HOST, () => {
  console.log('Servidor de desenvolvimento do OrganizAI');
  console.log(`  http://localhost:${PORT}/  -> redireciona para /ia/`);
  console.log(`  http://localhost:${PORT}/ia/`);
  console.log(`  http://localhost:${PORT}/organizai  -> /index.html`);
  console.log('Regras lidas de vercel.json (redirects, rewrites e headers).');
});

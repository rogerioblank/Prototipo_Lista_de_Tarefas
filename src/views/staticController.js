const { createReadStream, statSync } = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config/database");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};
const PUBLIC_FILES = new Set(["/index.html"]);
const PUBLIC_DIRS = [path.join(ROOT, "assets"), path.join(ROOT, "pages")];
const INDEX_FILE = path.join(ROOT, "index.html");

function respondError(response, status, message) {
  response.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(message);
}

function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname).replaceAll("\\", "/");
  } catch {
    respondError(response, 400, "Caminho inválido.");
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  const normalizedPathname = pathname.toLowerCase();
  const isPublicFile = PUBLIC_FILES.has(normalizedPathname);
  const isPublicAsset = normalizedPathname.startsWith("/assets/");
  const isPublicPage = normalizedPathname.startsWith("/pages/");
  if (!isPublicFile && !isPublicAsset && !isPublicPage) {
    respondError(response, 404, "Página não encontrada.");
    return;
  }

  const filePath = path.resolve(ROOT, `.${pathname}`);
  const insidePublicArea = filePath === INDEX_FILE ||
    PUBLIC_DIRS.some((dir) => filePath.startsWith(`${dir}${path.sep}`));
  if (!insidePublicArea) {
    respondError(response, 403, "Acesso negado.");
    return;
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    respondError(response, 404, "Página não encontrada.");
    return;
  }
  if (!stats.isFile() || !MIME_TYPES[path.extname(filePath).toLowerCase()]) {
    respondError(response, 404, "Página não encontrada.");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()]
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

module.exports = { serveStatic };

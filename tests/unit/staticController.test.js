const test = require("node:test");
const assert = require("node:assert/strict");
const { useTempDatabase, fakeResponse } = require("../helpers/unit");
const tmp = useTempDatabase();
const { serveStatic } = require("../../src/views/staticController");

test.after(() => tmp.cleanup());

// Para respostas 200 o controller faz pipe do arquivo; usamos um Writable simples.
const { Writable } = require("node:stream");
function sink() {
  const chunks = [];
  const w = new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } });
  w.status = null; w.headers = {};
  w.writeHead = (s, h) => { w.status = s; w.headers = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])); return w; };
  w.body = () => Buffer.concat(chunks).toString("utf8");
  return w;
}
function serve(pathname, method = "GET") {
  const res = sink();
  const done = new Promise((r) => res.on("finish", r));
  serveStatic({ method }, res, { pathname });
  return { res, done };
}

test("serve '/' como index.html (200, text/html, nosniff)", async () => {
  const { res, done } = serve("/");
  await done;
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /^text\/html/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.match(res.body(), /<title>Minhas tarefas/);
});

test("serve CSS e JS dos assets com MIME correto", async () => {
  const css = serve("/assets/css/styles.css"); await css.done;
  const js = serve("/assets/js/app.js"); await js.done;
  assert.match(css.res.headers["content-type"], /^text\/css/);
  assert.match(js.res.headers["content-type"], /^text\/javascript/);
});

test("HEAD responde 200 sem corpo", () => {
  const res = sink();
  serveStatic({ method: "HEAD" }, res, { pathname: "/index.html" });
  assert.equal(res.status, 200);
  assert.equal(res.body(), "");
});

for (const caminho of ["/server.js", "/package.json", "/src/config/database.js", "/data/meu-dia.sqlite", "/DATA/meu-dia.sqlite", "/tests/server.test.js", "/Readme.md", "/.gitignore"]) {
  test(`bloqueia acesso a ${caminho} (404)`, () => {
    const res = fakeResponse();
    serveStatic({ method: "GET" }, res, { pathname: caminho });
    assert.equal(res.status, 404);
  });
}

test("arquivo inexistente dentro de /assets → 404", () => {
  const res = fakeResponse();
  serveStatic({ method: "GET" }, res, { pathname: "/assets/js/nao-existe.js" });
  assert.equal(res.status, 404);
});

test("extensão fora da lista de MIME (ex.: .sqlite em /assets) → 404", () => {
  const res = fakeResponse();
  serveStatic({ method: "GET" }, res, { pathname: "/assets/x.sqlite" });
  assert.equal(res.status, 404);
});

test("percent-encoding inválido → 400", () => {
  const res = fakeResponse();
  serveStatic({ method: "GET" }, res, { pathname: "/assets/%E0%A4%A" });
  assert.equal(res.status, 400);
});

// ---- Segurança: path traversal ----------------------------------------
// '%2f' não é normalizado pelo parser de URL; depois de decodeURIComponent
// vira '../'. O caminho começa com /assets/, mas resolve para fora dela.
for (const caminho of ["/assets/..%2fserver.js", "/assets/..%2fsrc/config/database.js", "/pages/..%2fsrc/controllers/authController.js", "/assets/..%5cserver.js"]) {
  test(`SEGURANÇA: traversal ${caminho} NÃO pode expor código-fonte`, () => {
    const res = sink();
    serveStatic({ method: "GET" }, res, { pathname: caminho });
    assert.ok([403, 404].includes(res.status), `esperado 403/404, recebido ${res.status}`);
  });
}

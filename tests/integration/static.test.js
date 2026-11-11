// Testes de INTEGRAÇÃO: servidor de arquivos estáticos via HTTP real.
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("../helpers/server");

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.stop(); });
const get = (p, init) => fetch(`${srv.baseUrl}${p}`, { redirect: "manual", ...init });

test("GET / entrega a página inicial", async () => {
  const r = await get("/");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.match(await r.text(), /Meu dia/);
});

test("páginas e assets públicos são servidos com o MIME certo", async () => {
  for (const [p, mime] of [["/index.html", /html/], ["/pages/details.html", /html/], ["/assets/css/styles.css", /css/], ["/assets/css/details.css", /css/], ["/assets/js/app.js", /javascript/], ["/assets/js/auth.js", /javascript/], ["/assets/js/details.js", /javascript/]]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type"), mime, p);
  }
});

test("todos os <script>/<link> locais referenciados pelas páginas existem (sem 404)", async () => {
  for (const [page, base] of [["/index.html", "/"], ["/pages/details.html", "/pages/"]]) {
    const html = await (await get(page)).text();
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+?\.(?:js|css))"/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, page);
    for (const ref of refs) {
      const url = new URL(ref, `http://x${base}`).pathname;
      assert.equal((await get(url)).status, 200, `${page} → ${ref}`);
    }
  }
});

test("HEAD retorna cabeçalhos sem corpo", async () => {
  const r = await get("/index.html", { method: "HEAD" });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
});

test("POST em rota estática → 405 com cabeçalho Allow", async () => {
  const r = await get("/", { method: "POST" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET, HEAD");
});

for (const p of ["/server.js", "/package.json", "/Readme.md", "/atividade.txt", "/src/config/database.js", "/src/controllers/authController.js", "/tests/server.test.js", "/data/meu-dia.sqlite", "/DATA/meu-dia.sqlite", "/data/meu-dia.sqlite-wal", "/.gitignore", "/nao-existe"]) {
  test(`não expõe ${p} (404)`, async () => {
    assert.equal((await get(p)).status, 404);
  });
}

// ---- Segurança: path traversal (esperado FALHAR enquanto o bug existir) ----
for (const p of ["/assets/..%2fserver.js", "/assets/..%2fsrc/config/database.js", "/pages/..%2fsrc/controllers/authController.js", "/assets/..%5cserver.js"]) {
  test(`SEGURANÇA: path traversal ${p} não pode vazar código-fonte`, async () => {
    const r = await get(p);
    const corpo = await r.text();
    assert.ok([403, 404].includes(r.status), `status ${r.status}`);
    assert.ok(!/require\(|module\.exports/.test(corpo), "código-fonte do servidor foi entregue ao cliente");
  });
}

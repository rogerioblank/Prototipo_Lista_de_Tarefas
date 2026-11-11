// Testes de INTEGRAÇÃO / API: HTTP real → rotas → controllers → models → SQLite.
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, futureIso } = require("../helpers/server");

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.stop(); });

const json = (r) => r.json();

test.describe("Roteamento e proteções gerais", () => {
  test("rota de API inexistente (logado) → 404 JSON", async () => {
    const u = await srv.createUser();
    const r = await srv.request("/api/nao-existe", { cookie: u.cookie });
    assert.equal(r.status, 404);
    assert.ok((await json(r)).error);
  });

  test("rotas protegidas sem cookie → 401", async () => {
    for (const [m, p] of [["GET", "/api/tasks"], ["POST", "/api/tasks"], ["PATCH", "/api/tasks/" + "0".repeat(8) + "-0000-0000-0000-" + "0".repeat(12)], ["DELETE", "/api/tasks/" + "0".repeat(8) + "-0000-0000-0000-" + "0".repeat(12)]]) {
      const r = await srv.request(p, { method: m, body: m === "GET" ? undefined : {} });
      assert.equal(r.status, 401, `${m} ${p}`);
    }
  });

  test("mutação sem Content-Type JSON → 415", async () => {
    const r = await fetch(`${srv.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" });
    assert.equal(r.status, 415);
  });

  test("mutação sem Content-Type algum → 415", async () => {
    const r = await fetch(`${srv.baseUrl}/api/login`, { method: "POST" });
    assert.equal(r.status, 415);
  });

  test("Content-Type com charset é aceito", async () => {
    const r = await fetch(`${srv.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: "{}" });
    assert.equal(r.status, 401);
  });

  test("Origin de outro site → 403 (proteção CSRF)", async () => {
    const r = await srv.request("/api/login", { method: "POST", body: {}, headers: { Origin: "https://malicioso.example" } });
    assert.equal(r.status, 403);
  });

  test("Origin igual ao host → permitido", async () => {
    const r = await srv.request("/api/login", { method: "POST", body: {}, headers: { Origin: srv.baseUrl } });
    assert.equal(r.status, 401);
  });

  test("JSON inválido → 400", async () => {
    const r = await srv.request("/api/login", { method: "POST", rawBody: "{quebrado" });
    assert.equal(r.status, 400);
  });

  test("corpo acima de 16 KB → 413", async () => {
    const r = await srv.request("/api/login", { method: "POST", rawBody: JSON.stringify({ email: "x".repeat(20_000) }) });
    assert.equal(r.status, 413);
  });

  test("respostas da API trazem Cache-Control: no-store e nosniff", async () => {
    const r = await srv.request("/api/me");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  });
});

test.describe("Cadastro (POST /api/register)", () => {
  test("cria conta: 201, sem cookie de sessão, sem vazar senha", async () => {
    const r = await srv.request("/api/register", { method: "POST", body: { name: "Ana", email: "ana.reg@example.com", password: "12345678" } });
    assert.equal(r.status, 201);
    assert.equal(r.headers.get("set-cookie"), null);
    const texto = JSON.stringify(await json(r));
    assert.ok(!texto.includes("12345678"));
  });

  test("e-mail duplicado (case-insensitive) → 409", async () => {
    await srv.request("/api/register", { method: "POST", body: { name: "Dup", email: "dup@example.com", password: "12345678" } });
    const r = await srv.request("/api/register", { method: "POST", body: { name: "Dup", email: "DUP@EXAMPLE.COM", password: "12345678" } });
    assert.equal(r.status, 409);
  });

  const invalidos = [
    ["nome curto", { name: "A", email: "a1@example.com", password: "12345678" }],
    ["e-mail inválido", { name: "Ana", email: "ana", password: "12345678" }],
    ["senha curta", { name: "Ana", email: "a2@example.com", password: "1234567" }],
    ["corpo vazio", {}]
  ];
  for (const [nome, body] of invalidos) {
    test(`validação: ${nome} → 400`, async () => {
      assert.equal((await srv.request("/api/register", { method: "POST", body })).status, 400);
    });
  }

  test("importa tarefas antigas (localStorage) e informa a quantidade", async () => {
    const body = {
      name: "Legado", email: "legado@example.com", password: "12345678",
      legacyTasks: [
        { title: "A", area: "Casa", completed: false },
        { title: "B", area: "Trabalho", completed: true, completedAt: "2026-01-01T10:00:00.000Z" }
      ]
    };
    const r = await srv.request("/api/register", { method: "POST", body });
    assert.equal(r.status, 201);
    assert.equal((await json(r)).importedTasks, 2);
    const login = await srv.request("/api/login", { method: "POST", body: { email: body.email, password: body.password } });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const { tasks } = await json(await srv.request("/api/tasks", { cookie }));
    assert.deepEqual(tasks.map((t) => t.title).sort(), ["A", "B"]);
    assert.equal(tasks.find((t) => t.title === "B").completed, true);
  });

  test("tarefa antiga inválida aborta TODO o cadastro (400, usuário não é criado)", async () => {
    const body = { name: "Falha", email: "falha@example.com", password: "12345678", legacyTasks: [{ title: "ok", area: "Casa", completed: false }, { title: "ruim", area: "Lazer", completed: false }] };
    assert.equal((await srv.request("/api/register", { method: "POST", body })).status, 400);
    assert.equal(srv.queryDb("SELECT id FROM users WHERE email = ?", "falha@example.com").length, 0);
  });
});

test.describe("Sessão (login / me / logout)", () => {
  test("fluxo completo: login → /me → logout → /me 401", async () => {
    const u = await srv.createUser({ name: "Sessão Teste" });
    const me = await srv.request("/api/me", { cookie: u.cookie });
    assert.equal(me.status, 200);
    assert.equal((await json(me)).user.name, "Sessão Teste");
    assert.equal((await srv.request("/api/logout", { method: "POST", cookie: u.cookie, body: {} })).status, 200);
    assert.equal((await srv.request("/api/me", { cookie: u.cookie })).status, 401);
  });

  test("cookie de sessão tem HttpOnly, SameSite=Lax, Path=/ e validade de 7 dias", async () => {
    const u = await srv.createUser();
    const r = await srv.request("/api/login", { method: "POST", body: { email: u.email, password: u.password } });
    const c = r.headers.get("set-cookie");
    assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Path=\//); assert.match(c, /Max-Age=604800/);
  });

  test("senha errada → 401 e mesma mensagem de e-mail inexistente (sem enumeração de contas)", async () => {
    const u = await srv.createUser();
    const a = await srv.request("/api/login", { method: "POST", body: { email: u.email, password: "senha-errada-1" } });
    const b = await srv.request("/api/login", { method: "POST", body: { email: "nao-existe@example.com", password: "senha-errada-1" } });
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.equal((await json(a)).error, (await json(b)).error);
  });

  test("cookie forjado → 401", async () => {
    assert.equal((await srv.request("/api/me", { cookie: "session=forjado" })).status, 401);
  });

  test("várias sessões simultâneas: logout de uma não derruba a outra", async () => {
    const u = await srv.createUser();
    const l2 = await srv.request("/api/login", { method: "POST", body: { email: u.email, password: u.password } });
    const cookie2 = l2.headers.get("set-cookie").split(";")[0];
    await srv.request("/api/logout", { method: "POST", cookie: u.cookie, body: {} });
    assert.equal((await srv.request("/api/me", { cookie: cookie2 })).status, 200);
  });

  test("login com sessão expirada no banco → 401", async () => {
    const u = await srv.createUser();
    // Expira via sqlite diretamente (conexão de escrita rápida e fechada em seguida).
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(require("node:path").join(srv.dataDir, "meu-dia.sqlite"));
    db.exec("PRAGMA busy_timeout = 5000");
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(u.email);
    db.close();
    assert.equal((await srv.request("/api/me", { cookie: u.cookie })).status, 401);
  });
});

test.describe("Tarefas (CRUD)", () => {
  test("criar → listar → concluir → reabrir → excluir", async () => {
    const u = await srv.createUser();
    const created = await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: "Ler documentação", area: "Trabalho" } });
    assert.equal(created.status, 201);
    const { task } = await json(created);

    let { tasks } = await json(await srv.request("/api/tasks", { cookie: u.cookie }));
    assert.deepEqual(tasks, [task]);

    const done = await srv.request(`/api/tasks/${task.id}`, { method: "PATCH", cookie: u.cookie, body: { completed: true } });
    assert.equal(done.status, 200);
    const { completedAt } = await json(done);
    assert.ok(Date.parse(completedAt));
    ({ tasks } = await json(await srv.request("/api/tasks", { cookie: u.cookie })));
    assert.equal(tasks[0].completed, true);
    assert.equal(tasks[0].completedAt, completedAt);

    await srv.request(`/api/tasks/${task.id}`, { method: "PATCH", cookie: u.cookie, body: { completed: false } });
    ({ tasks } = await json(await srv.request("/api/tasks", { cookie: u.cookie })));
    assert.equal(tasks[0].completed, false);
    assert.equal(tasks[0].completedAt, null);

    assert.equal((await srv.request(`/api/tasks/${task.id}`, { method: "DELETE", cookie: u.cookie, body: {} })).status, 200);
    ({ tasks } = await json(await srv.request("/api/tasks", { cookie: u.cookie })));
    assert.deepEqual(tasks, []);
  });

  test("as 4 áreas fixas são aceitas e qualquer outra é recusada", async () => {
    const u = await srv.createUser();
    for (const area of ["Trabalho", "Casa", "Comunidade", "Pessoal"]) {
      assert.equal((await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: area, area } })).status, 201, area);
    }
    assert.equal((await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: "x", area: "Lazer" } })).status, 400);
  });

  test("agendamento: futuro é aceito e preservado; passado é recusado", async () => {
    const u = await srv.createUser();
    const when = futureIso(5);
    const ok = await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: "Futura", area: "Casa", scheduledAt: when } });
    assert.equal(ok.status, 201);
    assert.equal((await json(ok)).task.scheduledAt, when);
    const past = await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: "Passada", area: "Casa", scheduledAt: "2020-01-01T00:00:00.000Z" } });
    assert.equal(past.status, 400);
  });

  test("lista mais recente primeiro", async () => {
    const u = await srv.createUser();
    for (const t of ["primeira", "segunda", "terceira"]) {
      await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: t, area: "Casa" } });
      await new Promise((r) => setTimeout(r, 5));
    }
    const { tasks } = await json(await srv.request("/api/tasks", { cookie: u.cookie }));
    assert.deepEqual(tasks.map((t) => t.title), ["terceira", "segunda", "primeira"]);
  });

  test("PATCH com 'completed' inválido → 400", async () => {
    const u = await srv.createUser();
    const { task } = await json(await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: "x", area: "Casa" } }));
    assert.equal((await srv.request(`/api/tasks/${task.id}`, { method: "PATCH", cookie: u.cookie, body: { completed: "sim" } })).status, 400);
  });

  test("ID que não é UUID na URL → 404", async () => {
    const u = await srv.createUser();
    assert.equal((await srv.request("/api/tasks/abc", { method: "DELETE", cookie: u.cookie, body: {} })).status, 404);
  });

  test("método não suportado em /api/tasks (PUT) → 404", async () => {
    const u = await srv.createUser();
    assert.equal((await srv.request("/api/tasks", { method: "PUT", cookie: u.cookie, body: {} })).status, 404);
  });

  test("título com HTML/script é armazenado como texto (sem sanitização no servidor, escape fica no front)", async () => {
    const u = await srv.createUser();
    const titulo = '<img src=x onerror=alert(1)>';
    const { task } = await json(await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: titulo, area: "Casa" } }));
    assert.equal(task.title, titulo);
  });
});

test.describe("Isolamento entre usuários (autorização)", () => {
  test("usuário B não vê, altera nem exclui tarefa do usuário A", async () => {
    const a = await srv.createUser(), b = await srv.createUser();
    const { task } = await json(await srv.request("/api/tasks", { method: "POST", cookie: a.cookie, body: { title: "Privada", area: "Pessoal" } }));
    assert.deepEqual((await json(await srv.request("/api/tasks", { cookie: b.cookie }))).tasks, []);
    assert.equal((await srv.request(`/api/tasks/${task.id}`, { method: "PATCH", cookie: b.cookie, body: { completed: true } })).status, 404);
    assert.equal((await srv.request(`/api/tasks/${task.id}`, { method: "DELETE", cookie: b.cookie, body: {} })).status, 404);
    const { tasks } = await json(await srv.request("/api/tasks", { cookie: a.cookie }));
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].completed, false);
  });
});

test.describe("Persistência e auditoria no SQLite", () => {
  test("senha e token nunca aparecem em texto puro no banco", async () => {
    const u = await srv.createUser({ password: "minha-senha-secreta-xyz" });
    const token = u.cookie.split("=")[1];
    const dump = JSON.stringify([...srv.queryDb("SELECT * FROM users"), ...srv.queryDb("SELECT * FROM sessions")]);
    assert.ok(!dump.includes("minha-senha-secreta-xyz"));
    assert.ok(!dump.includes(token));
  });

  test("cada ação relevante gera uma linha em 'interactions' na ordem correta", async () => {
    const u = await srv.createUser();
    const { task } = await json(await srv.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: "Auditar", area: "Casa" } }));
    await srv.request(`/api/tasks/${task.id}`, { method: "PATCH", cookie: u.cookie, body: { completed: true } });
    await srv.request(`/api/tasks/${task.id}`, { method: "PATCH", cookie: u.cookie, body: { completed: false } });
    await srv.request(`/api/tasks/${task.id}`, { method: "DELETE", cookie: u.cookie, body: {} });
    await srv.request("/api/logout", { method: "POST", cookie: u.cookie, body: {} });
    const rows = srv.queryDb("SELECT action FROM interactions WHERE user_id = (SELECT id FROM users WHERE email = ?) ORDER BY id", u.email);
    assert.deepEqual(rows.map((r) => r.action), ["register", "login", "task_created", "task_completed", "task_reopened", "task_deleted", "logout"]);
  });
});

test("persistência: dados sobrevivem a reinício do servidor com o mesmo banco", async () => {
  const s1 = await startServer();
  let s2;
  try {
    const u = await s1.createUser();
    await s1.request("/api/tasks", { method: "POST", cookie: u.cookie, body: { title: "Sobrevive", area: "Casa" } });
    await s1.stop({ keepData: true });
    s2 = await startServer({ dataDir: s1.dataDir });
    // A sessão (cookie) também persiste, pois está no SQLite.
    const { tasks } = await json(await s2.request("/api/tasks", { cookie: u.cookie }));
    assert.deepEqual(tasks.map((t) => t.title), ["Sobrevive"]);
  } finally {
    await s1.stop({ keepData: true });
    if (s2) await s2.stop({ keepData: true });
    await require("node:fs/promises").rm(s1.dataDir, { recursive: true, force: true });
  }
});

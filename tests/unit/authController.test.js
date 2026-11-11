const test = require("node:test");
const assert = require("node:assert/strict");
const { useTempDatabase, fakeRequest, fakeResponse } = require("../helpers/unit");
const tmp = useTempDatabase();
const { db } = require("../../src/config/database");
const auth = require("../../src/controllers/authController");

test.after(() => tmp.cleanup());

const valid = { name: "Mariana Souza", email: "mariana@example.com", password: "senha-segura-1" };
async function register(body) {
  const res = fakeResponse();
  await auth.register(fakeRequest({ body }), res);
  return res;
}
async function login(body) {
  const res = fakeResponse();
  await auth.login(fakeRequest({ body }), res);
  return res;
}
const cookieOf = (res) => res.headers["set-cookie"].split(";")[0];
const reqWithCookie = (cookie) => ({ headers: { cookie } });

test("register: cria conta (201) e não devolve cookie de sessão", async () => {
  const res = await register(valid);
  assert.equal(res.status, 201);
  assert.deepEqual(res.json, { importedTasks: 0 });
  assert.equal(res.headers["set-cookie"], undefined);
});

test("register: senha nunca é gravada em texto puro (scrypt + salt)", async () => {
  const row = db.prepare("SELECT password_hash, password_salt FROM users WHERE email = ?").get(valid.email);
  assert.notEqual(row.password_hash, valid.password);
  assert.ok(!row.password_hash.includes(valid.password));
  assert.match(row.password_hash, /^[0-9a-f]{128}$/);
  assert.match(row.password_salt, /^[0-9a-f]{32}$/);
});

test("register: e-mail é normalizado (trim + minúsculas) e duplicado dá 409", async () => {
  const res = await register({ ...valid, email: "  MARIANA@Example.com " });
  assert.equal(res.status, 409);
});

test("register: dois usuários com a mesma senha têm hashes diferentes (salt único)", async () => {
  await register({ ...valid, email: "outra@example.com" });
  const rows = db.prepare("SELECT password_hash FROM users WHERE email IN (?, ?)").all(valid.email, "outra@example.com");
  assert.notEqual(rows[0].password_hash, rows[1].password_hash);
});

const invalidos = [
  ["nome curto", { name: "A" }],
  ["nome longo (81)", { name: "a".repeat(81) }],
  ["nome ausente", { name: undefined }],
  ["e-mail sem @", { email: "semarroba" }],
  ["e-mail sem domínio", { email: "a@b" }],
  ["e-mail com espaço", { email: "a b@c.com" }],
  ["e-mail > 254", { email: `${"a".repeat(250)}@x.com` }],
  ["senha com 7 caracteres", { password: "1234567" }],
  ["senha > 200", { password: "x".repeat(201) }],
  ["senha numérica (tipo errado)", { password: 12345678 }],
  ["legacyTasks não é array", { legacyTasks: "x" }],
  ["legacyTasks com área inválida", { legacyTasks: [{ title: "t", area: "Lazer", completed: false }] }],
  ["legacyTasks sem título", { legacyTasks: [{ title: "  ", area: "Casa", completed: false }] }],
  ["legacyTasks título > 120", { legacyTasks: [{ title: "x".repeat(121), area: "Casa", completed: false }] }],
  ["legacyTasks completed não booleano", { legacyTasks: [{ title: "t", area: "Casa", completed: "sim" }] }],
  ["legacyTasks data inválida", { legacyTasks: [{ title: "t", area: "Casa", completed: false, scheduledAt: "ontem" }] }],
  ["legacyTasks com item nulo", { legacyTasks: [null] }]
];
for (const [nome, patch] of invalidos) {
  test(`register: rejeita ${nome} com 400`, async () => {
    const res = await register({ ...valid, email: `v${Math.random().toString(36).slice(2)}@example.com`, ...patch });
    assert.equal(res.status, 400);
    assert.ok(res.json.error);
  });
}

test("register: importa tarefas antigas válidas e gera novos IDs", async () => {
  const res = await register({
    ...valid, email: "legado@example.com",
    legacyTasks: [
      { id: "id-antigo", title: " Tarefa antiga ", area: "Comunidade", completed: true, completedAt: "2026-01-01T10:00:00.000Z" },
      { title: "Sem id", area: "Casa", completed: false, scheduledAt: "2030-01-01T10:00:00.000Z" }
    ]
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.importedTasks, 2);
  const ids = db.prepare("SELECT t.id, t.title FROM tasks t JOIN users u ON u.id = t.user_id WHERE u.email = 'legado@example.com'").all();
  assert.equal(ids.length, 2);
  assert.ok(!ids.some((t) => t.id === "id-antigo"));
  assert.ok(ids.some((t) => t.title === "Tarefa antiga"));
});

test("login: credenciais corretas → 200 + cookie HttpOnly/SameSite/Path/Max-Age", async () => {
  const res = await login({ email: " MARIANA@example.com ", password: valid.password });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.email, valid.email);
  assert.equal(res.json.user.password_hash, undefined);
  const cookie = res.headers["set-cookie"];
  assert.match(cookie, /^session=[A-Za-z0-9_-]{43}/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=604800/);
  assert.doesNotMatch(cookie, /Secure/);
});

test("login: cookie ganha 'Secure' em produção", async () => {
  process.env.NODE_ENV = "production";
  try {
    const res = await login({ email: valid.email, password: valid.password });
    assert.match(res.headers["set-cookie"], /; Secure/);
  } finally { delete process.env.NODE_ENV; }
});

test("login: token da sessão é guardado apenas como hash SHA-256", async () => {
  const res = await login({ email: valid.email, password: valid.password });
  const token = cookieOf(res).split("=")[1];
  const hashes = db.prepare("SELECT token_hash FROM sessions").all().map((r) => r.token_hash);
  assert.ok(!hashes.includes(token));
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h)));
});

test("login: senha errada, e-mail inexistente e corpo vazio → 401 com a mesma mensagem", async () => {
  const a = await login({ email: valid.email, password: "errada-errada" });
  const b = await login({ email: "ninguem@example.com", password: "qualquer-coisa" });
  const c = await login({});
  for (const r of [a, b, c]) assert.equal(r.status, 401);
  assert.equal(a.json.error, b.json.error);
  assert.equal(a.headers["set-cookie"], undefined);
});

test("getUser: reconhece cookie válido e rejeita ausente/adulterado", async () => {
  const res = await login({ email: valid.email, password: valid.password });
  assert.equal(auth.getUser(reqWithCookie(cookieOf(res))).email, valid.email);
  assert.equal(auth.getUser({ headers: {} }), null);
  assert.equal(auth.getUser(reqWithCookie("session=token-falso")), null);
});

test("getUser: sessão expirada não autentica", async () => {
  const res = await login({ email: valid.email, password: valid.password });
  db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal(auth.getUser(reqWithCookie(cookieOf(res))), null);
});

test("currentUser: 200 logado, 401 anônimo", async () => {
  const l = await login({ email: valid.email, password: valid.password });
  const ok = fakeResponse(); auth.currentUser(reqWithCookie(cookieOf(l)), ok);
  assert.equal(ok.status, 200);
  const anon = fakeResponse(); auth.currentUser({ headers: {} }, anon);
  assert.equal(anon.status, 401);
});

test("logout: apaga a sessão, expira o cookie e registra interação", async () => {
  const l = await login({ email: valid.email, password: valid.password });
  const cookie = cookieOf(l);
  const res = fakeResponse();
  auth.logout(reqWithCookie(cookie), res);
  assert.equal(res.status, 200);
  assert.match(res.headers["set-cookie"], /Max-Age=0/);
  assert.equal(auth.getUser(reqWithCookie(cookie)), null);
  assert.ok(db.prepare("SELECT 1 FROM interactions WHERE action = 'logout'").get());
});

test("logout: sem sessão é idempotente (200)", () => {
  const res = fakeResponse();
  auth.logout({ headers: {} }, res);
  assert.equal(res.status, 200);
});

test("register: importação enorme é barrada pelo limite de corpo (413) antes de tocar o banco", async () => {
  const legacyTasks = Array.from({ length: 1001 }, () => ({ title: "t", area: "Casa", completed: false }));
  const antes = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  await assert.rejects(register({ ...valid, email: "enorme@example.com", legacyTasks }), (e) => e.status === 413);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, antes);
});

// Utilitários para testes de INTEGRAÇÃO e E2E: sobe o servidor real
// (server.js) em porta livre, com banco SQLite temporário isolado.
const { spawn } = require("node:child_process");
const { mkdtemp, rm } = require("node:fs/promises");
const { once } = require("node:events");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

async function getFreePort() {
  const l = net.createServer();
  l.listen(0, "127.0.0.1");
  await once(l, "listening");
  const { port } = l.address();
  await new Promise((r) => l.close(r));
  return port;
}

async function startServer({ dataDir } = {}) {
  const ownsDir = !dataDir;
  dataDir = dataDir || await mkdtemp(path.join(os.tmpdir(), "meu-dia-it-"));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(__dirname, "..", "..", "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (c) => { stderr += c; });

  for (let i = 0; ; i += 1) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou: ${stderr}`);
    if (i >= 100) throw new Error(`Servidor não respondeu: ${stderr}`);
    try { await fetch(`${baseUrl}/api/me`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  // request() devolve a Response do fetch; json() já resolve o corpo.
  function request(route, { method = "GET", cookie, body, headers = {}, rawBody } = {}) {
    const hasBody = body !== undefined || rawBody !== undefined;
    return fetch(`${baseUrl}${route}`, {
      method, redirect: "manual",
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(hasBody ? { "Content-Type": "application/json" } : {}), ...headers },
      ...(hasBody ? { body: rawBody !== undefined ? rawBody : JSON.stringify(body) } : {})
    });
  }

  let seq = 0;
  async function createUser(overrides = {}) {
    seq += 1;
    const user = { name: `Pessoa ${seq}`, email: `pessoa${seq}-${Date.now()}@example.com`, password: "senha-segura-123", ...overrides };
    const reg = await request("/api/register", { method: "POST", body: user });
    if (reg.status !== 201) throw new Error(`register falhou: ${reg.status} ${await reg.text()}`);
    const login = await request("/api/login", { method: "POST", body: { email: user.email, password: user.password } });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    return { ...user, cookie };
  }

  async function stop({ keepData = false } = {}) {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, "exit"); }
    if (ownsDir && !keepData) await rm(dataDir, { recursive: true, force: true });
  }

  function queryDb(sql, ...params) {
    const db = new DatabaseSync(path.join(dataDir, "meu-dia.sqlite"), { readOnly: true });
    try { return db.prepare(sql).all(...params); } finally { db.close(); }
  }

  return { baseUrl, port, dataDir, request, createUser, stop, queryDb };
}

const futureIso = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString();

module.exports = { startServer, getFreePort, futureIso };

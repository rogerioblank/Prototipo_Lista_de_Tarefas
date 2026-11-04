const { spawn } = require("node:child_process");
const { mkdtemp, rm } = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { once } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");

async function getFreePort() {
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("autenticação protege as tarefas e registra interações no SQLite", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "meu-dia-test-"));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let serverOutput = "";
  server.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });

  async function waitForServer() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`O servidor encerrou: ${serverOutput}`);
      try {
        return await fetch(`${baseUrl}/api/me`);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(`O servidor não respondeu: ${serverOutput}`);
  }

  function request(route, { method = "GET", cookie, body } = {}) {
    return fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }

  async function readJson(response) {
    return response.json();
  }

  try {
    assert.equal((await waitForServer()).status, 401);
    assert.equal((await fetch(`${baseUrl}/`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/src/config/database.js`)).status, 404);
    const registration = await request("/api/register", {
      method: "POST",
      body: {
        name: "Ana Exemplo",
        email: "ANA@example.com",
        password: "senha-segura-123",
        legacyTasks: [{
          id: "tarefa-antiga",
          title: "Tarefa salva anteriormente",
          area: "Casa",
          scheduledAt: null,
          completed: false
        }]
      }
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.headers.get("set-cookie"), null);
    const registrationResult = await readJson(registration);
    assert.equal(registrationResult.importedTasks, 1);
    assert.equal((await request("/api/me")).status, 401);

    const firstLogin = await request("/api/login", {
      method: "POST",
      body: { email: "ana@example.com", password: "senha-segura-123" }
    });
    assert.equal(firstLogin.status, 200);
    const firstCookie = firstLogin.headers.get("set-cookie").split(";")[0];

    const duplicate = await request("/api/register", {
      method: "POST",
      body: { name: "Ana Exemplo", email: "ana@example.com", password: "senha-segura-123" }
    });
    assert.equal(duplicate.status, 409);

    const invalidLogin = await request("/api/login", {
      method: "POST",
      body: { email: "ana@example.com", password: "senha-incorreta" }
    });
    assert.equal(invalidLogin.status, 401);

    const created = await request("/api/tasks", {
      method: "POST",
      cookie: firstCookie,
      body: { title: "Ler documentação", area: "Trabalho" }
    });
    assert.equal(created.status, 201);
    const task = (await readJson(created)).task;
    assert.equal(task.title, "Ler documentação");

    const secondRegistration = await request("/api/register", {
      method: "POST",
      body: { name: "Outra Pessoa", email: "outra@example.com", password: "outra-senha-123" }
    });
    assert.equal(secondRegistration.status, 201);
    const secondLogin = await request("/api/login", {
      method: "POST",
      body: { email: "outra@example.com", password: "outra-senha-123" }
    });
    const secondCookie = secondLogin.headers.get("set-cookie").split(";")[0];
    const secondTasks = await request("/api/tasks", { cookie: secondCookie });
    assert.deepEqual((await readJson(secondTasks)).tasks, []);

    const completed = await request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      cookie: firstCookie,
      body: { completed: true }
    });
    assert.equal(completed.status, 200);
    const firstTasks = await request("/api/tasks", { cookie: firstCookie });
    assert.equal((await readJson(firstTasks)).tasks[0].completed, true);

    const protectedDatabase = await fetch(`${baseUrl}/data/meu-dia.sqlite`);
    assert.equal(protectedDatabase.status, 404);
    const protectedDatabaseWithDifferentCase = await fetch(`${baseUrl}/DATA/meu-dia.sqlite`);
    assert.equal(protectedDatabaseWithDifferentCase.status, 404);

    const deleted = await request(`/api/tasks/${task.id}`, {
      method: "DELETE",
      cookie: firstCookie,
      body: {}
    });
    assert.equal(deleted.status, 200);
    const emptyTasks = await request("/api/tasks", { cookie: firstCookie });
    const remainingTasks = (await readJson(emptyTasks)).tasks;
    assert.equal(remainingTasks.length, 1);
    assert.equal(remainingTasks[0].title, "Tarefa salva anteriormente");

    await request("/api/logout", { method: "POST", cookie: firstCookie, body: {} });
    assert.equal((await request("/api/tasks", { cookie: firstCookie })).status, 401);

  } finally {
    server.kill();
    await once(server, "exit");
    const db = new DatabaseSync(path.join(dataDir, "meu-dia.sqlite"));
    const actions = db.prepare("SELECT action FROM interactions ORDER BY id").all().map(({ action }) => action);
    db.close();
    assert.deepEqual(actions, ["register", "task_imported", "login", "task_created", "register", "login", "task_completed", "task_deleted", "logout"]);
    await rm(dataDir, { recursive: true, force: true });
  }
});

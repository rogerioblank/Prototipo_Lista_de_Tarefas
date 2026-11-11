const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { useTempDatabase, fakeRequest, fakeResponse, futureIso } = require("../helpers/unit");
const tmp = useTempDatabase();
const { db } = require("../../src/config/database");
const userModel = require("../../src/models/userModel");
const tasks = require("../../src/controllers/taskController");

test.after(() => tmp.cleanup());

const mkUser = (n) => {
  const u = { id: randomUUID(), name: `U${n}`, email: `u${n}@example.com`, passwordHash: "h", passwordSalt: "s", createdAt: new Date().toISOString() };
  userModel.createWithTasks(u, []);
  return { id: u.id };
};
const ana = mkUser(1), bia = mkUser(2);

async function create(user, body) {
  const res = fakeResponse();
  await tasks.create(fakeRequest({ body }), res, user);
  return res;
}

test("create: cria tarefa mínima (título + área) e devolve 201", async () => {
  const res = await create(ana, { title: "Enviar relatório", area: "Trabalho" });
  assert.equal(res.status, 201);
  assert.match(res.json.task.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...res.json.task, id: undefined }, { id: undefined, title: "Enviar relatório", area: "Trabalho", scheduledAt: null, completed: false, completedAt: null });
});

test("create: aplica trim ao título", async () => {
  const res = await create(ana, { title: "   Lavar roupa   ", area: "Casa" });
  assert.equal(res.json.task.title, "Lavar roupa");
});

test("create: aceita título com exatamente 120 caracteres", async () => {
  assert.equal((await create(ana, { title: "a".repeat(120), area: "Casa" })).status, 201);
});

test("create: aceita agendamento futuro", async () => {
  const when = futureIso(3);
  const res = await create(ana, { title: "Reunião", area: "Trabalho", scheduledAt: when });
  assert.equal(res.status, 201);
  assert.equal(res.json.task.scheduledAt, when);
});

const invalidos = [
  ["título vazio", { title: "", area: "Casa" }],
  ["título só com espaços", { title: "    ", area: "Casa" }],
  ["título ausente", { area: "Casa" }],
  ["título não-string", { title: 123, area: "Casa" }],
  ["título com 121 caracteres", { title: "a".repeat(121), area: "Casa" }],
  ["área inválida", { title: "ok", area: "Lazer" }],
  ["área ausente", { title: "ok" }],
  ["área em minúsculas", { title: "ok", area: "casa" }],
  ["data inválida", { title: "ok", area: "Casa", scheduledAt: "amanhã" }],
  ["data no passado", { title: "ok", area: "Casa", scheduledAt: "2020-01-01T10:00:00.000Z" }],
  ["data numérica", { title: "ok", area: "Casa", scheduledAt: 1700000000000 }]
];
for (const [nome, body] of invalidos) {
  test(`create: rejeita ${nome} com 400`, async () => {
    const res = await create(ana, body);
    assert.equal(res.status, 400);
    assert.ok(res.json.error);
  });
}

test("create: registra a interação 'task_created'", async () => {
  const res = await create(bia, { title: "Auditar", area: "Pessoal" });
  const row = db.prepare("SELECT action, details FROM interactions WHERE task_id = ?").get(res.json.task.id);
  assert.equal(row.action, "task_created");
  assert.deepEqual(JSON.parse(row.details), { title: "Auditar", area: "Pessoal" });
});

test("list: devolve só as tarefas do usuário logado", () => {
  const res = fakeResponse();
  tasks.list({}, res, bia);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.tasks.map((t) => t.title), ["Auditar"]);
});

test("updateCompletion: conclui, reabre e registra interações", async () => {
  const { json: { task } } = await create(ana, { title: "Alternar", area: "Casa" });
  const done = fakeResponse();
  await tasks.updateCompletion(fakeRequest({ body: { completed: true }, method: "PATCH" }), done, ana, task.id);
  assert.equal(done.status, 200);
  assert.ok(Date.parse(done.json.completedAt));
  const reopen = fakeResponse();
  await tasks.updateCompletion(fakeRequest({ body: { completed: false }, method: "PATCH" }), reopen, ana, task.id);
  assert.equal(reopen.json.completedAt, null);
  const actions = db.prepare("SELECT action FROM interactions WHERE task_id = ? ORDER BY id").all(task.id).map((r) => r.action);
  assert.deepEqual(actions, ["task_created", "task_completed", "task_reopened"]);
});

for (const valor of ["true", 1, null, undefined]) {
  test(`updateCompletion: 'completed' = ${JSON.stringify(valor)} é rejeitado com 400`, async () => {
    const res = fakeResponse();
    await tasks.updateCompletion(fakeRequest({ body: { completed: valor } }), res, ana, randomUUID());
    assert.equal(res.status, 400);
  });
}

test("updateCompletion: tarefa inexistente → 404", async () => {
  const res = fakeResponse();
  await tasks.updateCompletion(fakeRequest({ body: { completed: true } }), res, ana, randomUUID());
  assert.equal(res.status, 404);
});

test("updateCompletion: tarefa de OUTRO usuário → 404 e nada muda", async () => {
  const { json: { task } } = await create(ana, { title: "Só da Ana", area: "Casa" });
  const res = fakeResponse();
  await tasks.updateCompletion(fakeRequest({ body: { completed: true } }), res, bia, task.id);
  assert.equal(res.status, 404);
  const listAna = fakeResponse(); tasks.list({}, listAna, ana);
  assert.equal(listAna.json.tasks.find((t) => t.id === task.id).completed, false);
});

test("remove: apaga a própria tarefa e registra 'task_deleted'", async () => {
  const { json: { task } } = await create(ana, { title: "Apagar", area: "Casa" });
  const res = fakeResponse();
  tasks.remove({}, res, ana, task.id);
  assert.equal(res.status, 200);
  const l = fakeResponse(); tasks.list({}, l, ana);
  assert.ok(!l.json.tasks.some((t) => t.id === task.id));
  assert.ok(db.prepare("SELECT 1 FROM interactions WHERE action = 'task_deleted' AND task_id = ?").get(task.id));
});

test("remove: tarefa inexistente ou de outro usuário → 404", async () => {
  const { json: { task } } = await create(ana, { title: "Protegida", area: "Casa" });
  const alheia = fakeResponse(); tasks.remove({}, alheia, bia, task.id);
  const inexistente = fakeResponse(); tasks.remove({}, inexistente, ana, randomUUID());
  assert.equal(alheia.status, 404);
  assert.equal(inexistente.status, 404);
});

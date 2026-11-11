const test = require("node:test");
const assert = require("node:assert/strict");
const { useTempDatabase } = require("../helpers/unit");
const tmp = useTempDatabase();
const { db } = require("../../src/config/database");
const userModel = require("../../src/models/userModel");
const taskModel = require("../../src/models/taskModel");
const sessionModel = require("../../src/models/sessionModel");
const interactionModel = require("../../src/models/interactionModel");

test.after(() => tmp.cleanup());

const mkUser = (n) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, name: `Usuário ${n}`, email: `u${n}@example.com`,
  passwordHash: "hash", passwordSalt: "salt", createdAt: "2026-01-01T10:00:00.000Z"
});
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test("userModel.createWithTasks: grava usuário, tarefas e interações", () => {
  const u = mkUser(1);
  userModel.createWithTasks(u, [
    { id: "t-1", title: "Importada", area: "Casa", scheduledAt: null, completed: true, completedAt: "2026-01-02T10:00:00.000Z" }
  ]);
  assert.equal(userModel.findByEmail("u1@example.com").id, u.id);
  assert.equal(taskModel.findAllByUserId(u.id).length, 1);
  const actions = db.prepare("SELECT action FROM interactions WHERE user_id = ? ORDER BY id").all(u.id).map((r) => r.action);
  assert.deepEqual(actions, ["register", "task_imported"]);
});

test("userModel.findByEmail: retorna undefined quando não existe", () => {
  assert.equal(userModel.findByEmail("naoexiste@example.com"), undefined);
});

test("userModel.createWithTasks: e-mail duplicado faz ROLLBACK completo", () => {
  const dup = { ...mkUser(2), email: "u1@example.com" };
  const antes = { users: count("users"), tasks: count("tasks"), inter: count("interactions") };
  assert.throws(() => userModel.createWithTasks(dup, [
    { id: "t-x", title: "Não pode ficar", area: "Casa", scheduledAt: null, completed: false, completedAt: null }
  ]));
  assert.deepEqual({ users: count("users"), tasks: count("tasks"), inter: count("interactions") }, antes);
});

test("taskModel: create + findAllByUserId converte completed para boolean e mapeia camelCase", () => {
  const u = mkUser(3); userModel.createWithTasks(u, []);
  taskModel.create({ id: "a", userId: u.id, title: "A", area: "Trabalho", scheduledAt: null, createdAt: "2026-02-01T00:00:00.000Z" });
  const [t] = taskModel.findAllByUserId(u.id);
  assert.deepEqual(t, { id: "a", title: "A", area: "Trabalho", scheduledAt: null, completed: false, completedAt: null });
});

test("taskModel.findAllByUserId: ordena por criação, mais recente primeiro", () => {
  const u = mkUser(4); userModel.createWithTasks(u, []);
  taskModel.create({ id: "velha", userId: u.id, title: "velha", area: "Casa", scheduledAt: null, createdAt: "2026-01-01T00:00:00.000Z" });
  taskModel.create({ id: "nova", userId: u.id, title: "nova", area: "Casa", scheduledAt: null, createdAt: "2026-03-01T00:00:00.000Z" });
  assert.deepEqual(taskModel.findAllByUserId(u.id).map((t) => t.id), ["nova", "velha"]);
});

test("taskModel: isolamento entre usuários em find/update/delete", () => {
  const a = mkUser(5), b = mkUser(6);
  userModel.createWithTasks(a, []); userModel.createWithTasks(b, []);
  taskModel.create({ id: "da-a", userId: a.id, title: "da A", area: "Pessoal", scheduledAt: null, createdAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(taskModel.findByIdAndUserId("da-a", b.id), null);
  taskModel.updateCompletion("da-a", b.id, true, "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
  taskModel.deleteByIdAndUserId("da-a", b.id);
  const [t] = taskModel.findAllByUserId(a.id);
  assert.equal(t.completed, false);
  assert.equal(t.id, "da-a");
});

test("taskModel.updateCompletion: conclui e reabre", () => {
  const u = mkUser(7); userModel.createWithTasks(u, []);
  taskModel.create({ id: "c", userId: u.id, title: "C", area: "Casa", scheduledAt: null, createdAt: "2026-01-01T00:00:00.000Z" });
  taskModel.updateCompletion("c", u.id, true, "2026-01-05T00:00:00.000Z", "2026-01-05T00:00:00.000Z");
  assert.deepEqual(taskModel.findAllByUserId(u.id)[0].completed, true);
  assert.equal(taskModel.findAllByUserId(u.id)[0].completedAt, "2026-01-05T00:00:00.000Z");
  taskModel.updateCompletion("c", u.id, false, null, "2026-01-06T00:00:00.000Z");
  assert.equal(taskModel.findAllByUserId(u.id)[0].completed, false);
  assert.equal(taskModel.findAllByUserId(u.id)[0].completedAt, null);
});

test("sessionModel: sessão válida, expirada e removida", () => {
  const u = mkUser(8); userModel.createWithTasks(u, []);
  sessionModel.create({ tokenHash: "h-valido", userId: u.id, expiresAt: "2999-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
  sessionModel.create({ tokenHash: "h-expirado", userId: u.id, expiresAt: "2020-01-01T00:00:00.000Z", createdAt: "2019-01-01T00:00:00.000Z" });
  const now = "2026-06-01T00:00:00.000Z";
  assert.equal(sessionModel.findUserByTokenHash("h-valido", now).email, "u8@example.com");
  assert.equal(sessionModel.findUserByTokenHash("h-expirado", now), null);
  assert.equal(sessionModel.findUserByTokenHash("h-inexistente", now), null);
  sessionModel.deleteByTokenHash("h-valido");
  assert.equal(sessionModel.findUserByTokenHash("h-valido", now), null);
});

test("interactionModel.record: persiste ação e detalhes em JSON", () => {
  const u = mkUser(9); userModel.createWithTasks(u, []);
  interactionModel.record(u.id, "task_created", "tid", { title: "X" });
  const row = db.prepare("SELECT * FROM interactions WHERE action = 'task_created' AND user_id = ?").get(u.id);
  assert.equal(row.task_id, "tid");
  assert.deepEqual(JSON.parse(row.details), { title: "X" });
});

test("banco: apagar usuário remove tarefas, sessões e interações (ON DELETE CASCADE)", () => {
  const u = mkUser(10); userModel.createWithTasks(u, []);
  taskModel.create({ id: "casc", userId: u.id, title: "x", area: "Casa", scheduledAt: null, createdAt: "2026-01-01T00:00:00.000Z" });
  sessionModel.create({ tokenHash: "h-casc", userId: u.id, expiresAt: "2999-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
  db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
  for (const t of ["tasks", "sessions", "interactions"]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(u.id).n, 0, t);
  }
});

test("banco: e-mail único é garantido pelo schema", () => {
  assert.throws(() => db.prepare("INSERT INTO users (id,name,email,password_hash,password_salt,created_at) VALUES ('z','Z','u1@example.com','h','s','d')").run());
});

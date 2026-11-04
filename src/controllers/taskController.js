const { randomUUID } = require("node:crypto");
const taskModel = require("../models/taskModel");
const interactionModel = require("../models/interactionModel");
const { readBody, respond } = require("../utils/http");

const AREAS = ["Trabalho", "Casa", "Comunidade", "Pessoal"];

function isValidDate(value) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function list(request, response, user) {
  return respond(response, 200, { tasks: taskModel.findAllByUserId(user.id) });
}

async function create(request, response, user) {
  const body = await readBody(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const area = body.area;
  const scheduledAt = body.scheduledAt === undefined ? null : body.scheduledAt;
  if (!title || title.length > 120) return respond(response, 400, { error: "O título deve ter entre 1 e 120 caracteres." });
  if (!AREAS.includes(area)) return respond(response, 400, { error: "Selecione uma área válida." });
  if (!isValidDate(scheduledAt)) return respond(response, 400, { error: "A data programada é inválida." });
  if (scheduledAt && Date.parse(scheduledAt) <= Date.now()) return respond(response, 400, { error: "Escolha uma data e horário futuros." });

  const id = randomUUID();
  taskModel.create({ id, userId: user.id, title, area, scheduledAt, createdAt: new Date().toISOString() });
  interactionModel.record(user.id, "task_created", id, { title, area });
  return respond(response, 201, { task: { id, title, area, scheduledAt, completed: false, completedAt: null } });
}

async function updateCompletion(request, response, user, taskId) {
  const body = await readBody(request);
  if (typeof body.completed !== "boolean") return respond(response, 400, { error: "Informe um estado válido para a tarefa." });
  const task = taskModel.findByIdAndUserId(taskId, user.id);
  if (!task) return respond(response, 404, { error: "Tarefa não encontrada." });
  const completedAt = body.completed ? new Date().toISOString() : null;
  taskModel.updateCompletion(task.id, user.id, body.completed, completedAt, new Date().toISOString());
  interactionModel.record(user.id, body.completed ? "task_completed" : "task_reopened", task.id);
  return respond(response, 200, { ok: true, completedAt });
}

function remove(request, response, user, taskId) {
  const task = taskModel.findByIdAndUserId(taskId, user.id);
  if (!task) return respond(response, 404, { error: "Tarefa não encontrada." });
  interactionModel.record(user.id, "task_deleted", task.id, { title: task.title });
  taskModel.deleteByIdAndUserId(task.id, user.id);
  return respond(response, 200, { ok: true });
}

module.exports = { list, create, updateCompletion, remove };

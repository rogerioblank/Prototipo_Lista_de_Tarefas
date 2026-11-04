const {
  randomBytes,
  randomUUID,
  scrypt: scryptCallback,
  timingSafeEqual,
  createHash
} = require("node:crypto");
const { promisify } = require("node:util");
const userModel = require("../models/userModel");
const sessionModel = require("../models/sessionModel");
const interactionModel = require("../models/interactionModel");
const { readBody, respond, parseCookies } = require("../utils/http");

const scrypt = promisify(scryptCallback);
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function setSession(response, userId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION);
  sessionModel.create({
    tokenHash: hashToken(token),
    userId,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString()
  });
  response.setHeader("Set-Cookie", `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION / 1000}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

function clearSession(response, user) {
  if (user) sessionModel.deleteByTokenHash(user.token_hash);
  response.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function getUser(request) {
  const token = parseCookies(request).session;
  if (!token) return null;
  return sessionModel.findUserByTokenHash(hashToken(token), new Date().toISOString());
}

function isValidDate(value) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function validateLegacyTasks(legacyTasks) {
  const areas = ["Trabalho", "Casa", "Comunidade", "Pessoal"];
  if (!Array.isArray(legacyTasks) || legacyTasks.length > 1000) {
    return { error: "Não foi possível importar as tarefas antigas." };
  }
  const tasks = [];
  for (const task of legacyTasks) {
    if (!task || typeof task !== "object") {
      return { error: "Uma tarefa antiga contém dados inválidos; revise os dados salvos e tente novamente." };
    }
    const title = typeof task.title === "string" ? task.title.trim() : "";
    const scheduledAt = task.scheduledAt ?? null;
    const completedAt = task.completedAt ?? null;
    if (!title || title.length > 120 || !areas.includes(task.area) ||
        typeof task.completed !== "boolean" || !isValidDate(scheduledAt) || !isValidDate(completedAt)) {
      return { error: "Uma tarefa antiga contém dados inválidos; revise os dados salvos e tente novamente." };
    }
    tasks.push({
      id: randomUUID(),
      title,
      area: task.area,
      scheduledAt,
      completed: task.completed,
      completedAt
    });
  }
  return { tasks };
}

async function register(request, response) {
  const body = await readBody(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (name.length < 2 || name.length > 80) return respond(response, 400, { error: "Informe um nome com pelo menos 2 caracteres." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond(response, 400, { error: "Informe um e-mail válido." });
  if (password.length < 8 || password.length > 200) return respond(response, 400, { error: "A senha deve ter entre 8 e 200 caracteres." });
  const imported = validateLegacyTasks(body.legacyTasks === undefined ? [] : body.legacyTasks);
  if (imported.error) return respond(response, 400, { error: imported.error });
  if (userModel.findByEmail(email)) return respond(response, 409, { error: "Este e-mail já possui cadastro. Faça login." });

  const id = randomUUID();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(password, salt, 64)).toString("hex");
  const user = { id, name, email, passwordHash, passwordSalt: salt, createdAt: new Date().toISOString() };
  userModel.createWithTasks(user, imported.tasks);
  return respond(response, 201, {
    importedTasks: imported.tasks.length
  });
}

async function login(request, response) {
  const body = await readBody(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const account = userModel.findByEmail(email);
  const candidate = await scrypt(password, account?.password_salt || "invalid-login-salt", 64);
  const expected = account ? Buffer.from(account.password_hash, "hex") : Buffer.alloc(64);
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected) || !account) {
    return respond(response, 401, { error: "E-mail ou senha incorretos." });
  }
  setSession(response, account.id);
  interactionModel.record(account.id, "login");
  return respond(response, 200, { user: { id: account.id, name: account.name, email: account.email } });
}

function currentUser(request, response) {
  const user = getUser(request);
  return user
    ? respond(response, 200, { user: { id: user.id, name: user.name, email: user.email } })
    : respond(response, 401, { error: "Faça login para continuar." });
}

function logout(request, response) {
  const user = getUser(request);
  clearSession(response, user);
  if (user) interactionModel.record(user.id, "logout");
  return respond(response, 200, { ok: true });
}

module.exports = { register, login, currentUser, logout, getUser };

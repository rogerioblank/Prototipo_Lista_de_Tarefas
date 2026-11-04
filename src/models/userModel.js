const { db } = require("../config/database");
const taskModel = require("./taskModel");
const interactionModel = require("./interactionModel");

function findByEmail(email) {
  return db.prepare(`
    SELECT id, name, email, password_hash, password_salt
    FROM users WHERE email = ?
  `).get(email);
}

function create({ id, name, email, passwordHash, passwordSalt, createdAt }) {
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, email, passwordHash, passwordSalt, createdAt);
}

function createWithTasks(user, tasks) {
  db.exec("BEGIN");
  try {
    create(user);
    interactionModel.record(user.id, "register", null, { email: user.email });
    taskModel.createMany(user.id, tasks, user.createdAt);
    for (const task of tasks) {
      interactionModel.record(user.id, "task_imported", task.id, { title: task.title, area: task.area });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { findByEmail, createWithTasks };

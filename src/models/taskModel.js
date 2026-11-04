const { db } = require("../config/database");

function create({ id, userId, title, area, scheduledAt, createdAt }) {
  db.prepare(`
    INSERT INTO tasks (id, user_id, title, area, scheduled_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, title, area, scheduledAt, createdAt, createdAt);
}

function createMany(userId, tasks, now) {
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, user_id, title, area, scheduled_at, completed, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const task of tasks) {
    insertTask.run(task.id, userId, task.title, task.area, task.scheduledAt, Number(task.completed), task.completedAt, now, now);
  }
}

function findAllByUserId(userId) {
  return db.prepare(`
    SELECT id, title, area, scheduled_at AS scheduledAt, completed, completed_at AS completedAt
    FROM tasks WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map((task) => ({ ...task, completed: Boolean(task.completed) }));
}

function findByIdAndUserId(id, userId) {
  return db.prepare("SELECT id, title FROM tasks WHERE id = ? AND user_id = ?").get(id, userId) || null;
}

function updateCompletion(id, userId, completed, completedAt, updatedAt) {
  db.prepare("UPDATE tasks SET completed = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(Number(completed), completedAt, updatedAt, id, userId);
}

function deleteByIdAndUserId(id, userId) {
  db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, userId);
}

module.exports = { create, createMany, findAllByUserId, findByIdAndUserId, updateCompletion, deleteByIdAndUserId };

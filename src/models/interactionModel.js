const { db } = require("../config/database");

function record(userId, action, taskId = null, details = {}) {
  db.prepare(`
    INSERT INTO interactions (user_id, task_id, action, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, taskId, action, JSON.stringify(details), new Date().toISOString());
}

module.exports = { record };

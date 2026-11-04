const { db } = require("../config/database");

function create({ tokenHash, userId, expiresAt, createdAt }) {
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt, createdAt);
}

function findUserByTokenHash(tokenHash, now) {
  return db.prepare(`
    SELECT users.id, users.name, users.email, sessions.token_hash
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, now) || null;
}

function deleteByTokenHash(tokenHash) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

module.exports = { create, findUserByTokenHash, deleteByTokenHash };

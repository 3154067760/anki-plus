const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('./auth');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'anki.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    front_text TEXT DEFAULT '',
    back_text TEXT DEFAULT '',
    front_images TEXT DEFAULT '[]',
    back_images TEXT DEFAULT '[]',
    front_audio TEXT DEFAULT '',
    back_audio TEXT DEFAULT '',
    ease REAL DEFAULT 2.5,
    interval REAL DEFAULT 0,
    repetitions INTEGER DEFAULT 0,
    due_date INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
`);

function migrate() {
  const cols = db.prepare('PRAGMA table_info(cards)').all().map(c => c.name);
  if (!cols.includes('user_id')) {
    db.exec('ALTER TABLE cards ADD COLUMN user_id TEXT');
  }

  const settingsCols = db.prepare('PRAGMA table_info(settings)').all().map(c => c.name);
  if (settingsCols.includes('key') && !settingsCols.includes('user_id')) {
    const old = db.prepare('SELECT key, value FROM settings').all();
    db.exec('ALTER TABLE settings RENAME TO settings_old');
    db.exec(`
      CREATE TABLE settings (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      )
    `);
    const admin = ensureDefaultAdmin();
    const ins = db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)');
    for (const row of old) ins.run(admin.id, row.key, row.value);
    db.exec('DROP TABLE settings_old');
  }

  const admin = ensureDefaultAdmin();
  db.prepare('UPDATE cards SET user_id = ? WHERE user_id IS NULL OR user_id = ""').run(admin.id);
}

function ensureDefaultAdmin() {
  let admin = db.prepare('SELECT * FROM users WHERE username = ?').get('gyq');
  if (!admin) {
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, 'gyq', hashPassword('root'), 'admin', Date.now()
    );
    admin = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else if (admin.role !== 'admin') {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', admin.id);
    admin = db.prepare('SELECT * FROM users WHERE id = ?').get(admin.id);
  }
  getUserUploadsDir(admin.id);
  return admin;
}

migrate();

const DEFAULT_SETTINGS = {
  initialInterval: 1,
  easyBonus: 1.3,
  hardInterval: 0.5,
  graduatingInterval: 1,
  maxInterval: 365,
  minEase: 1.3,
  newCardsPerDay: 20,
  reviewsPerDay: 200
};

function getUserUploadsDir(userId) {
  const dir = path.join(UPLOADS_DIR, userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseCard(row) {
  if (!row) return null;
  return {
    ...row,
    front_images: JSON.parse(row.front_images || '[]'),
    back_images: JSON.parse(row.back_images || '[]')
  };
}

function getSettings(userId) {
  const settings = { ...DEFAULT_SETTINGS };
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId);
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) settings[row.key] = JSON.parse(row.value);
  }
  return settings;
}

function setSettings(userId, partial) {
  const current = getSettings(userId);
  const merged = { ...current, ...partial };
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(merged)) {
      if (key in DEFAULT_SETTINGS) stmt.run(userId, key, JSON.stringify(value));
    }
  });
  tx();
  return merged;
}

function getAllCards(userId) {
  return db.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(parseCard);
}

function getCard(id, userId) {
  return parseCard(db.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').get(id, userId));
}

function getDueCards(userId, now = Date.now(), limit = 50) {
  return db.prepare(`
    SELECT * FROM cards WHERE user_id = ? AND due_date <= ?
    ORDER BY due_date ASC LIMIT ?
  `).all(userId, now, limit).map(parseCard);
}

function getAllDueCards(userId, now = Date.now()) {
  return db.prepare(`
    SELECT * FROM cards WHERE user_id = ? AND due_date <= ?
    ORDER BY due_date ASC
  `).all(userId, now).map(parseCard);
}

function getNewCards(userId) {
  return db.prepare(`
    SELECT * FROM cards WHERE user_id = ? AND repetitions = 0
    ORDER BY created_at DESC
  `).all(userId).map(parseCard);
}

function searchCards(userId, keyword) {
  const q = `%${keyword}%`;
  return db.prepare(`
    SELECT * FROM cards WHERE user_id = ? AND (front_text LIKE ? OR back_text LIKE ?)
    ORDER BY created_at DESC
  `).all(userId, q, q).map(parseCard);
}

function getDueCount(userId, now = Date.now()) {
  return db.prepare('SELECT COUNT(*) as count FROM cards WHERE user_id = ? AND due_date <= ?').get(userId, now).count;
}

function getStats(userId, now = Date.now()) {
  return db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN due_date <= ? THEN 1 ELSE 0 END) as due,
      SUM(CASE WHEN repetitions = 0 THEN 1 ELSE 0 END) as new_cards
    FROM cards WHERE user_id = ?
  `).get(now, userId);
}

function createCard(userId, data) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO cards (id, user_id, front_text, back_text, front_images, back_images, front_audio, back_audio, due_date, created_at, updated_at)
    VALUES (@id, @user_id, @front_text, @back_text, @front_images, @back_images, @front_audio, @back_audio, @due_date, @created_at, @updated_at)
  `).run({
    id: data.id,
    user_id: userId,
    front_text: data.front_text || '',
    back_text: data.back_text || '',
    front_images: JSON.stringify(data.front_images || []),
    back_images: JSON.stringify(data.back_images || []),
    front_audio: data.front_audio || '',
    back_audio: data.back_audio || '',
    due_date: now,
    created_at: now,
    updated_at: now
  });
  return getCard(data.id, userId);
}

function updateCard(card, userId) {
  const existing = getCard(card.id, userId);
  if (!existing) return null;
  db.prepare(`
    UPDATE cards SET
      front_text = @front_text, back_text = @back_text,
      front_images = @front_images, back_images = @back_images,
      front_audio = @front_audio, back_audio = @back_audio,
      ease = @ease, interval = @interval, repetitions = @repetitions,
      due_date = @due_date, updated_at = @updated_at
    WHERE id = @id AND user_id = @user_id
  `).run({
    ...card,
    user_id: userId,
    front_images: JSON.stringify(card.front_images || []),
    back_images: JSON.stringify(card.back_images || []),
    updated_at: Date.now()
  });
  return getCard(card.id, userId);
}

function deleteCard(id, userId) {
  const card = getCard(id, userId);
  if (!card) return null;
  db.prepare('DELETE FROM cards WHERE id = ? AND user_id = ?').run(id, userId);
  return card;
}

function toCardRow(card, userId) {
  const now = Date.now();
  return {
    id: card.id,
    user_id: userId,
    front_text: card.front_text || '',
    back_text: card.back_text || '',
    front_images: JSON.stringify(card.front_images || []),
    back_images: JSON.stringify(card.back_images || []),
    front_audio: card.front_audio || '',
    back_audio: card.back_audio || '',
    ease: card.ease ?? 2.5,
    interval: card.interval ?? 0,
    repetitions: card.repetitions ?? 0,
    due_date: card.due_date ?? now,
    created_at: card.created_at ?? now,
    updated_at: card.updated_at ?? now
  };
}

function exportData(userId) {
  return {
    version: 2,
    app: 'anki-plus',
    exported_at: Date.now(),
    settings: getSettings(userId),
    cards: getAllCards(userId)
  };
}

function importData(userId, payload, mode = 'merge') {
  const cards = payload.cards || [];
  if (!Array.isArray(cards)) throw new Error('无效的卡片数据');

  let imported = 0;
  let skipped = 0;
  const getById = db.prepare('SELECT id FROM cards WHERE id = ? AND user_id = ?');

  const tx = db.transaction(() => {
    if (mode === 'replace') {
      db.prepare('DELETE FROM cards WHERE user_id = ?').run(userId);
      if (payload.settings) setSettings(userId, payload.settings);
    } else if (payload.settings) {
      setSettings(userId, { ...getSettings(userId), ...payload.settings });
    }

    for (const card of cards) {
      if (!card.id) { skipped++; continue; }
      if (mode === 'merge' && getById.get(card.id, userId)) {
        skipped++;
        continue;
      }
      if (mode === 'replace' || !getById.get(card.id, userId)) {
        db.prepare(`
          INSERT INTO cards (id, user_id, front_text, back_text, front_images, back_images, front_audio, back_audio, ease, interval, repetitions, due_date, created_at, updated_at)
          VALUES (@id, @user_id, @front_text, @back_text, @front_images, @back_images, @front_audio, @back_audio, @ease, @interval, @repetitions, @due_date, @created_at, @updated_at)
        `).run(toCardRow(card, userId));
        imported++;
      }
    }
  });
  tx();
  return { imported, skipped, total: cards.length };
}

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, created_at: user.created_at };
}

function getAllUsers() {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
}

function createUser(username, password, role = 'user') {
  if (!username || username.length < 2) throw new Error('用户名至少 2 个字符');
  if (!password || password.length < 3) throw new Error('密码至少 3 个字符');
  if (findUserByUsername(username)) throw new Error('用户名已存在');
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, username, hashPassword(password), role, Date.now()
  );
  getUserUploadsDir(id);
  return publicUser(findUserById(id));
}

function deleteUser(id) {
  const user = findUserById(id);
  if (!user) return null;
  if (user.username === 'gyq') throw new Error('不能删除默认管理员');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cards WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM settings WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  tx();
  const uploadDir = path.join(UPLOADS_DIR, id);
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
  return publicUser(user);
}

module.exports = {
  db,
  DATA_DIR,
  UPLOADS_DIR,
  getUserUploadsDir,
  getSettings,
  setSettings,
  getAllCards,
  getCard,
  getDueCards,
  getAllDueCards,
  getNewCards,
  searchCards,
  getDueCount,
  getStats,
  createCard,
  updateCard,
  deleteCard,
  exportData,
  importData,
  findUserByUsername,
  findUserById,
  publicUser,
  getAllUsers,
  createUser,
  deleteUser
};

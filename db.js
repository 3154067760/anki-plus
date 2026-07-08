const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'anki.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
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
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

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

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

function getSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const row = getSettingStmt.get(key);
    if (row) settings[key] = JSON.parse(row.value);
  }
  return settings;
}

function setSettings(partial) {
  const current = getSettings();
  const merged = { ...current, ...partial };
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(merged)) {
      if (key in DEFAULT_SETTINGS) {
        setSettingStmt.run(key, JSON.stringify(value));
      }
    }
  });
  tx();
  return merged;
}

function parseCard(row) {
  if (!row) return null;
  return {
    ...row,
    front_images: JSON.parse(row.front_images || '[]'),
    back_images: JSON.parse(row.back_images || '[]')
  };
}

const cardQueries = {
  getAll: db.prepare('SELECT * FROM cards ORDER BY created_at DESC'),
  getById: db.prepare('SELECT * FROM cards WHERE id = ?'),
  getDue: db.prepare(`
    SELECT * FROM cards
    WHERE due_date <= ?
    ORDER BY due_date ASC
    LIMIT ?
  `),
  getAllDue: db.prepare(`
    SELECT * FROM cards
    WHERE due_date <= ?
    ORDER BY due_date ASC
  `),
  getNew: db.prepare(`
    SELECT * FROM cards
    WHERE repetitions = 0
    ORDER BY created_at DESC
  `),
  search: db.prepare(`
    SELECT * FROM cards
    WHERE front_text LIKE ? OR back_text LIKE ?
    ORDER BY created_at DESC
  `),
  countDue: db.prepare('SELECT COUNT(*) as count FROM cards WHERE due_date <= ?'),
  insert: db.prepare(`
    INSERT INTO cards (id, front_text, back_text, front_images, back_images, front_audio, back_audio, due_date, created_at, updated_at)
    VALUES (@id, @front_text, @back_text, @front_images, @back_images, @front_audio, @back_audio, @due_date, @created_at, @updated_at)
  `),
  insertFull: db.prepare(`
    INSERT INTO cards (id, front_text, back_text, front_images, back_images, front_audio, back_audio, ease, interval, repetitions, due_date, created_at, updated_at)
    VALUES (@id, @front_text, @back_text, @front_images, @back_images, @front_audio, @back_audio, @ease, @interval, @repetitions, @due_date, @created_at, @updated_at)
  `),
  update: db.prepare(`
    UPDATE cards SET
      front_text = @front_text, back_text = @back_text,
      front_images = @front_images, back_images = @back_images,
      front_audio = @front_audio, back_audio = @back_audio,
      ease = @ease, interval = @interval, repetitions = @repetitions,
      due_date = @due_date, updated_at = @updated_at
    WHERE id = @id
  `),
  delete: db.prepare('DELETE FROM cards WHERE id = ?'),
  deleteAll: db.prepare('DELETE FROM cards'),
  stats: db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN due_date <= ? THEN 1 ELSE 0 END) as due,
      SUM(CASE WHEN repetitions = 0 THEN 1 ELSE 0 END) as new_cards
    FROM cards
  `)
};

function getAllCards() {
  return cardQueries.getAll.all().map(parseCard);
}

function getCard(id) {
  return parseCard(cardQueries.getById.get(id));
}

function getDueCards(now = Date.now(), limit = 50) {
  return cardQueries.getDue.all(now, limit).map(parseCard);
}

function getAllDueCards(now = Date.now()) {
  return cardQueries.getAllDue.all(now).map(parseCard);
}

function getNewCards() {
  return cardQueries.getNew.all().map(parseCard);
}

function searchCards(keyword) {
  const q = `%${keyword}%`;
  return cardQueries.search.all(q, q).map(parseCard);
}

function getDueCount(now = Date.now()) {
  return cardQueries.countDue.get(now).count;
}

function getStats(now = Date.now()) {
  return cardQueries.stats.get(now);
}

function createCard(data) {
  const now = Date.now();
  const card = {
    id: data.id,
    front_text: data.front_text || '',
    back_text: data.back_text || '',
    front_images: JSON.stringify(data.front_images || []),
    back_images: JSON.stringify(data.back_images || []),
    front_audio: data.front_audio || '',
    back_audio: data.back_audio || '',
    due_date: now,
    created_at: now,
    updated_at: now
  };
  cardQueries.insert.run(card);
  return getCard(card.id);
}

function updateCard(card) {
  cardQueries.update.run({
    ...card,
    front_images: JSON.stringify(card.front_images || []),
    back_images: JSON.stringify(card.back_images || []),
    updated_at: Date.now()
  });
  return getCard(card.id);
}

function deleteCard(id) {
  const card = getCard(id);
  if (!card) return null;
  cardQueries.delete.run(id);
  return card;
}

function toCardRow(card) {
  const now = Date.now();
  return {
    id: card.id,
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

function exportData() {
  return {
    version: 1,
    app: 'anki-plus',
    exported_at: Date.now(),
    settings: getSettings(),
    cards: getAllCards()
  };
}

function importData(payload, mode = 'merge') {
  const cards = payload.cards || [];
  if (!Array.isArray(cards)) throw new Error('无效的卡片数据');

  let imported = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    if (mode === 'replace') {
      cardQueries.deleteAll.run();
      if (payload.settings) setSettings(payload.settings);
    } else if (payload.settings) {
      setSettings({ ...getSettings(), ...payload.settings });
    }

    for (const card of cards) {
      if (!card.id) { skipped++; continue; }
      if (mode === 'merge' && cardQueries.getById.get(card.id)) {
        skipped++;
        continue;
      }
      cardQueries.insertFull.run(toCardRow(card));
      imported++;
    }
  });
  tx();

  return { imported, skipped, total: cards.length };
}

module.exports = {
  db,
  DATA_DIR,
  UPLOADS_DIR,
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
  importData
};

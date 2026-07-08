const express = require('express');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { reviewCard, previewIntervals, formatInterval } = require('./sm2');

const app = express();
const PORT = process.env.PORT || 3030;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, db.UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(db.UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/stats', (_req, res) => {
  res.json(getStatsResponse());
});

function getStatsResponse() {
  const now = Date.now();
  return {
    ...db.getStats(now),
    due: db.getDueCount(now),
    settings: db.getSettings()
  };
}

app.get('/api/cards', (req, res) => {
  const filter = req.query.filter;
  const search = req.query.search?.trim();
  const now = Date.now();
  let cards;
  if (search) cards = db.searchCards(search);
  else if (filter === 'due') cards = db.getAllDueCards(now);
  else if (filter === 'new') cards = db.getNewCards();
  else cards = db.getAllCards();
  res.json(cards);
});

app.get('/api/cards/due', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json(db.getDueCards(Date.now(), limit));
});

app.get('/api/cards/:id/intervals', (req, res) => {
  const card = db.getCard(req.params.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  const settings = db.getSettings();
  const intervals = previewIntervals(card, settings).map(({ quality, interval }) => ({
    quality,
    interval,
    label: formatInterval(interval)
  }));
  res.json({ intervals });
});

app.get('/api/cards/:id', (req, res) => {
  const card = db.getCard(req.params.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  res.json(card);
});

app.post('/api/cards', (req, res) => {
  const card = db.createCard({ ...req.body, id: uuidv4() });
  res.status(201).json(card);
});

app.put('/api/cards/:id', (req, res) => {
  const existing = db.getCard(req.params.id);
  if (!existing) return res.status(404).json({ error: '卡片不存在' });
  const card = db.updateCard({ ...existing, ...req.body, id: req.params.id });
  res.json(card);
});

app.delete('/api/cards/:id', (req, res) => {
  const card = db.deleteCard(req.params.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  res.json({ ok: true });
});

app.post('/api/cards/:id/review', (req, res) => {
  const card = db.getCard(req.params.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  const quality = req.body.quality;
  if (![0, 1, 2, 3].includes(quality)) {
    return res.status(400).json({ error: 'quality 必须是 0-3' });
  }
  const settings = db.getSettings();
  const updated = reviewCard(card, quality, settings);
  db.updateCard(updated);
  res.json({ card: updated, stats: getStatsResponse() });
});

app.get('/api/settings', (_req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  const settings = db.setSettings(req.body);
  res.json(settings);
});

app.get('/api/export', (_req, res) => {
  const data = db.exportData();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="anki-plus-backup-${date}.json"`);
  res.json(data);
});

app.post('/api/import', (req, res) => {
  const mode = req.body.mode === 'replace' ? 'replace' : 'merge';
  if (!req.body.cards || !Array.isArray(req.body.cards)) {
    return res.status(400).json({ error: '缺少 cards 数组' });
  }
  try {
    const result = db.importData(req.body, mode);
    res.json({ ...result, stats: getStatsResponse() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/api/upload/batch', upload.array('files', 20), (req, res) => {
  const urls = (req.files || []).map(f => `/uploads/${f.filename}`);
  res.json({ urls });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function getLocalIPs() {
  const ips = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Anki-plus 运行在 http://0.0.0.0:${PORT}`);
  console.log(`数据目录: ${db.DATA_DIR}`);
  const ips = getLocalIPs();
  if (ips.length) {
    console.log('手机端测试（同一 WiFi）：');
    ips.forEach(ip => console.log(`  http://${ip}:${PORT}`));
  }
});

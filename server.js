const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { reviewCard, previewIntervals, formatInterval } = require('./sm2');
const { exportZip, importZip } = require('./export-import');
const { verifyPassword, createToken, authMiddleware, adminMiddleware } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(db.UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

function uploadStorage(req, _file, cb) {
  if (!req.user) return cb(new Error('未登录'));
  cb(null, db.getUserUploadsDir(req.user.id));
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadStorage,
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.bin'}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const importUpload = multer({
  dest: path.join(os.tmpdir(), 'anki-import'),
  limits: { fileSize: 200 * 1024 * 1024 }
});

function statsFor(userId) {
  const now = Date.now();
  return { ...db.getStats(userId, now), due: db.getDueCount(userId, now), settings: db.getSettings(userId) };
}

function importFn(userId, data, mode) {
  return db.importData(userId, data, mode);
}

// ── Auth（无需登录）──
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = db.findUserByUsername(username.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = createToken(user);
  res.json({ token, user: db.publicUser(user) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  res.json(db.publicUser(user));
});

// ── 以下接口需要登录 ──
app.use('/api', authMiddleware);

app.get('/api/stats', (req, res) => res.json(statsFor(req.user.id)));

app.get('/api/cards', (req, res) => {
  const { filter, search } = req.query;
  const uid = req.user.id;
  const now = Date.now();
  let cards;
  if (search?.trim()) cards = db.searchCards(uid, search.trim());
  else if (filter === 'due') cards = db.getAllDueCards(uid, now);
  else if (filter === 'new') cards = db.getNewCards(uid);
  else cards = db.getAllCards(uid);
  res.json(cards);
});

app.get('/api/cards/due', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json(db.getDueCards(req.user.id, Date.now(), limit));
});

app.get('/api/cards/:id/intervals', (req, res) => {
  const card = db.getCard(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  const settings = db.getSettings(req.user.id);
  const intervals = previewIntervals(card, settings).map(({ quality, interval }) => ({
    quality, interval, label: formatInterval(interval)
  }));
  res.json({ intervals });
});

app.get('/api/cards/:id', (req, res) => {
  const card = db.getCard(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  res.json(card);
});

app.post('/api/cards', (req, res) => {
  const card = db.createCard(req.user.id, { ...req.body, id: uuidv4() });
  res.status(201).json(card);
});

app.put('/api/cards/:id', (req, res) => {
  const existing = db.getCard(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: '卡片不存在' });
  const card = db.updateCard({ ...existing, ...req.body, id: req.params.id }, req.user.id);
  res.json(card);
});

app.delete('/api/cards/:id', (req, res) => {
  const card = db.deleteCard(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  res.json({ ok: true });
});

app.post('/api/cards/:id/review', (req, res) => {
  const card = db.getCard(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  const quality = req.body.quality;
  if (![0, 1, 2, 3].includes(quality)) return res.status(400).json({ error: 'quality 必须是 0-3' });
  const settings = db.getSettings(req.user.id);
  const updated = reviewCard(card, quality, settings);
  db.updateCard(updated, req.user.id);
  res.json({ card: updated, stats: statsFor(req.user.id) });
});

app.get('/api/settings', (req, res) => res.json(db.getSettings(req.user.id)));

app.put('/api/settings', (req, res) => {
  res.json(db.setSettings(req.user.id, req.body));
});

app.get('/api/export', (req, res) => {
  const data = db.exportData(req.user.id);
  const date = new Date().toISOString().slice(0, 10);
  exportZip(data, db.getUserUploadsDir(req.user.id), res, `anki-plus-backup-${date}.zip`);
});

app.post('/api/import', importUpload.single('file'), (req, res) => {
  const mode = req.body.mode === 'replace' ? 'replace' : 'merge';
  const uid = req.user.id;
  const uploadsDir = db.getUserUploadsDir(uid);

  if (req.file) {
    try {
      const result = importZip(req.file.path, uploadsDir, (data, m) => importFn(uid, data, m), mode);
      fs.unlinkSync(req.file.path);
      return res.json({ ...result, stats: statsFor(uid) });
    } catch (e) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: e.message });
    }
  }
  return res.status(400).json({ error: '请上传 ZIP 备份文件' });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.json({ url: `/uploads/${req.user.id}/${req.file.filename}` });
});

app.post('/api/upload/batch', upload.array('files', 20), (req, res) => {
  const urls = (req.files || []).map(f => `/uploads/${req.user.id}/${f.filename}`);
  res.json({ urls });
});

// ── 管理员：用户管理 ──
app.get('/api/users', adminMiddleware, (_req, res) => {
  res.json(db.getAllUsers());
});

app.post('/api/users', adminMiddleware, (req, res) => {
  try {
    const user = db.createUser(req.body.username?.trim(), req.body.password, 'user');
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/users/:id', adminMiddleware, (req, res) => {
  try {
    const user = db.deleteUser(req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ ok: true, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Anki-plus 运行在 http://0.0.0.0:${PORT}`);
  console.log(`数据目录: ${db.DATA_DIR}`);
  console.log('默认管理员: gyq / root');
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address);
  if (ips.length) {
    console.log('手机端测试（同一 WiFi）：');
    ips.forEach(ip => console.log(`  http://${ip}:${PORT}`));
  }
});

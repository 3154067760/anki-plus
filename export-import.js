const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

function exportZip(data, uploadsDir, res, filename) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).end();
    throw err;
  });
  archive.pipe(res);

  archive.append(JSON.stringify(data, null, 2), { name: 'backup.json' });
  if (fs.existsSync(uploadsDir)) {
    addDirToArchive(archive, uploadsDir, 'uploads');
  }
  return archive.finalize();
}

function addDirToArchive(archive, dirPath, zipPath) {
  for (const name of fs.readdirSync(dirPath)) {
    const full = path.join(dirPath, name);
    const entry = zipPath ? `${zipPath}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      addDirToArchive(archive, full, entry);
    } else {
      archive.file(full, { name: entry });
    }
  }
}

function clearUploads(uploadsDir) {
  if (!fs.existsSync(uploadsDir)) return;
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function importZip(zipPath, uploadsDir, importDataFn, mode) {
  const zip = new AdmZip(zipPath);
  const backupEntry = zip.getEntry('backup.json');
  if (!backupEntry) throw new Error('ZIP 中缺少 backup.json');

  const data = JSON.parse(backupEntry.getData().toString('utf8'));
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  if (mode === 'replace') clearUploads(uploadsDir);

  let mediaCount = 0;
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith('uploads/') || entry.isDirectory) continue;
    const rel = entry.entryName.slice('uploads/'.length);
    if (!rel) continue;
    const dest = path.join(uploadsDir, rel);
    if (mode === 'merge' && fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.getData());
    mediaCount++;
  }

  const result = importDataFn(data, mode);
  return { ...result, mediaCount };
}

module.exports = { exportZip, importZip };
